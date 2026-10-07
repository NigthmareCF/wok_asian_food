import { z } from "zod";
import { accountStorageKey, normalizeAccountOwner, withAccountStorage, type AccountStorage } from "./account-storage";

const bodySchema = z.object({ guests: z.number().int().min(1).max(50), requestedAt: z.iso.datetime({ offset: true }),
  preorder: z.boolean(), notes: z.string().max(500).nullable() }).strict();
const pendingSchema = z.object({ ownerEmail: z.string().min(1), key: z.uuid(), body: z.string().min(1).max(6000), savedAt: z.number().int().nonnegative() });
const draftSchema = z.object({ ownerEmail: z.string().min(1), guests: z.string().max(3), requestedAt: z.string().max(40),
  notes: z.string().max(500), preorder: z.boolean(), savedAt: z.number().int().nonnegative() });
const resultSchema = z.object({ requestId: z.uuid(), reservationId: z.uuid().nullable(), submitted: z.boolean(),
  decision: z.enum(["ACCEPT", "ACCEPT_WITH_CONDITIONS", "SUGGEST_OTHER_TIME", "REQUIRES_HUMAN_APPROVAL", "REJECT"]),
  reasonCodes: z.array(z.string()), minimumOccupancyMinutes: z.number().int().nonnegative(),
  maximumOccupancyMinutes: z.number().int().nonnegative(), message: z.string() });
export type ReservationDraft = z.infer<typeof draftSchema>;
export type PendingReservationAttempt = z.infer<typeof pendingSchema>;
type State = { ready: boolean; draft: ReservationDraft | null; pending: PendingReservationAttempt | null; error: string | null };
const legacyDraftKey = "wok.client.reservation-draft.v1";

export function createReservationState(storage: AccountStorage, email?: string | null, isCurrent = () => true) {
  const owner = normalizeAccountOwner(email);
  const draftKey = accountStorageKey("reservation-draft", owner);
  const pendingKey = accountStorageKey("reservation-pending", owner);
  let state: State = { ready: false, draft: null, pending: null, error: null };
  const initial = state;
  const listeners = new Set<() => void>();
  let restoring: Promise<void> | null = null;
  const assertCurrent = () => { if (!isCurrent()) throw new Error("Reservation account changed"); };
  const assertOwner = (email: string) => { if (!owner || normalizeAccountOwner(email) !== owner) throw new Error("Reservation owner mismatch or guest"); };
  const publish = (next: State) => { if (!isCurrent()) return; state = next; listeners.forEach((listener) => listener()); };
  function parseDraft(raw: string | null) {
    if (!raw || raw.length > 6000) return null;
    try {
      const parsed = draftSchema.parse(JSON.parse(raw));
      if (normalizeAccountOwner(parsed.ownerEmail) !== owner || Date.now() - parsed.savedAt >= 30 * 24 * 60 * 60 * 1000 || parsed.savedAt > Date.now() + 300_000) return null;
      return { ...parsed, ownerEmail: owner! };
    } catch { return null; }
  }
  return {
    bindLifecycle(check: () => boolean) { isCurrent = check; },
    getSnapshot: () => state,
    getServerSnapshot: () => initial,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    restore() {
      if (state.ready || !isCurrent()) return Promise.resolve();
      if (!restoring) restoring = withAccountStorage(storage, async () => {
        if (!owner) { publish({ ...state, ready: true }); return; }
        const [rawDraft, rawPending] = await Promise.all([storage.getItemAsync(draftKey), storage.getItemAsync(pendingKey)]);
        let draft = parseDraft(rawDraft);
        if (rawPending && rawPending.length > 16_000) throw new Error("Invalid reservation evidence size");
        const pending = rawPending ? pendingSchema.parse(JSON.parse(rawPending)) : null;
        if (pending) { assertOwner(pending.ownerEmail); bodySchema.parse(JSON.parse(pending.body)); pending.ownerEmail = owner; }
        if (rawDraft === null && !pending) {
          draft = parseDraft(await storage.getItemAsync(legacyDraftKey));
          if (draft) await storage.setItemAsync(draftKey, JSON.stringify(draft));
        }
        publish({ ready: true, draft, pending, error: null });
      }).catch(() => { publish({ ...state, error: "No pudimos recuperar la solicitud con seguridad. Reintenta antes de enviarla." }); })
        .finally(() => { restoring = null; });
      return restoring;
    },
    async saveDraft(draft: ReservationDraft) {
      assertCurrent(); assertOwner(draft.ownerEmail);
      if (!state.ready) throw new Error("Reservation not restored");
      const validated = draftSchema.parse({ ...draft, ownerEmail: owner });
      if (state.pending) return;
      await withAccountStorage(storage, async () => {
        assertCurrent(); if (state.pending) return;
        await storage.setItemAsync(draftKey, JSON.stringify(validated));
        assertCurrent(); publish({ ...state, draft: validated, error: null });
      });
    },
    async prepare(body: string, key: string) {
      assertCurrent(); assertOwner(owner ?? "");
      if (!state.ready) throw new Error("Reservation not restored");
      bodySchema.parse(JSON.parse(body));
      const pending = pendingSchema.parse({ ownerEmail: owner, key, body, savedAt: state.pending?.savedAt ?? Date.now() });
      if (state.pending && (state.pending.key !== key || state.pending.body !== body)) throw new Error("Unresolved reservation attempt");
      publish({ ...state, pending, error: null });
      await withAccountStorage(storage, () => storage.setItemAsync(pendingKey, JSON.stringify(pending)));
      assertCurrent(); return pending;
    },
    async acknowledge(key: string, response: unknown) {
      assertCurrent();
      const result = resultSchema.parse(response);
      if (state.pending?.key !== key || result.requestId !== key || result.submitted !== (result.reservationId !== null)) throw new Error("Reservation acknowledgement mismatch");
      const expectsReservation = !["REJECT", "SUGGEST_OTHER_TIME"].includes(result.decision);
      if (result.submitted !== expectsReservation || result.maximumOccupancyMinutes < result.minimumOccupancyMinutes) throw new Error("Invalid reservation evaluation");
      await withAccountStorage(storage, async () => {
        assertCurrent();
        // A cleared marker prevents retained legacy drafts from being migrated again.
        // Retain pending evidence if either cleanup write fails.
        await storage.setItemAsync(draftKey, "null");
        assertCurrent(); await storage.deleteItemAsync(pendingKey);
      });
      assertCurrent(); publish({ ready: true, draft: null, pending: null, error: null });
      return result;
    },
  };
}
