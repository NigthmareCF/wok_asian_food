import { z } from "zod";
import type { PickupRequestBody } from "./api";
import { accountStorageKey, normalizeAccountOwner, withAccountStorage, type AccountStorage } from "./account-storage";

const attemptKey = "wok.pickup.pending.v1";
const itemsSchema = z.record(z.uuid(), z.number().int().min(1).max(50));
const attemptSchema = z.object({
  email: z.string().min(1), key: z.uuid(), body: z.object({
    requestedFor: z.iso.datetime({ offset: true }), customerNote: z.string().max(500).optional(),
    items: z.array(z.object({ menuItemId: z.uuid(), quantity: z.number().int().min(1).max(50) })).min(1),
  }),
});
export type PickupAttempt = { email: string; key: string; body: PickupRequestBody };
type CartState = { items: Record<string, number>; attempt: PickupAttempt | null; ready: boolean; error: string | null };
export function createCartState(storage: AccountStorage, email?: string | null) {
  const owner = normalizeAccountOwner(email);
  const ownerCartKey = accountStorageKey("cart", owner);
  const ownerAttemptKey = accountStorageKey("pending", owner);
  let state: CartState = { items: {}, attempt: null, ready: false, error: null };
  const initialState = state;
  const listeners = new Set<() => void>();
  let restoring: Promise<void> | null = null;
  let active = true;
  const assertActive = () => { if (!active) throw new Error("Cart account changed: inactive store"); };
  const publish = (next: CartState) => { if (!active) return; state = next; listeners.forEach((listener) => listener()); };
  function ownedAttempt(value: unknown) {
    const attempt = attemptSchema.parse(value);
    if (!owner || normalizeAccountOwner(attempt.email) !== owner) throw new Error("Attempt owner mismatch");
    return { ...attempt, email: owner };
  }
  function persist(snapshot: CartState) {
    if (snapshot.attempt) ownedAttempt(snapshot.attempt);
    return withAccountStorage(storage, async () => {
      await storage.setItemAsync(ownerCartKey, JSON.stringify(snapshot.items));
      if (snapshot.attempt) await storage.setItemAsync(ownerAttemptKey, JSON.stringify(snapshot.attempt));
      else await storage.deleteItemAsync(ownerAttemptKey);
    });
  }
  return {
    getSnapshot: () => state,
    getServerSnapshot: () => initialState,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    deactivate() { active = false; listeners.clear(); },
    restore() {
      if (!active) return Promise.resolve();
      if (state.ready) return Promise.resolve();
      if (!restoring) restoring = (async () => {
        try {
          const restored = await withAccountStorage(storage, async () => {
            const [cart, attempt] = await Promise.all([storage.getItemAsync(ownerCartKey), storage.getItemAsync(ownerAttemptKey)]);
            let items = cart ? itemsSchema.parse(JSON.parse(cart)) : {};
            let pending = attempt ? ownedAttempt(JSON.parse(attempt)) : null;
            if (cart === null && pending) items = Object.fromEntries(pending.body.items.map((item) => [item.menuItemId, item.quantity]));
            if (owner && cart === null && attempt === null) {
              const legacy = await storage.getItemAsync(attemptKey);
              // Never attribute ownerless selections, or consume/delete another account's evidence.
              let parsed: { email?: string } | null = null;
              try { parsed = legacy ? JSON.parse(legacy) : null; } catch { /* Unattributable legacy data stays untouched. */ }
              if (parsed && typeof parsed.email === "string" && normalizeAccountOwner(parsed.email) === owner) {
                pending = ownedAttempt(parsed);
                // The request body, not the ownerless global cart, proves the selection's owner.
                items = Object.fromEntries(pending.body.items.map((item) => [item.menuItemId, item.quantity]));
                await storage.setItemAsync(ownerAttemptKey, JSON.stringify(pending));
                await storage.setItemAsync(ownerCartKey, JSON.stringify(items));
              }
            }
            return { items, attempt: pending, ready: true, error: null };
          });
          publish(restored);
        } catch { publish({ ...state, error: "No pudimos recuperar el carrito con seguridad. Reintenta antes de editar o enviar." }); }
      })().finally(() => { restoring = null; });
      return restoring;
    },
    changeQuantity(id: string, delta: number) {
      if (!active || !state.ready || state.attempt || !z.uuid().safeParse(id).success || !Number.isInteger(delta)) return;
      const items = { ...state.items };
      const quantity = (items[id] ?? 0) + delta;
      if (quantity > 50) return;
      if (quantity <= 0) delete items[id]; else items[id] = quantity;
      publish({ ...state, items, error: null });
      void persist(state).catch(() => { publish({ ...state, error: "No pudimos guardar el carrito en este dispositivo." }); });
    },
    async prepareAttempt(attempt: PickupAttempt) {
      assertActive();
      if (!state.ready) throw new Error("Cart not restored");
      const validated = ownedAttempt(attempt);
      if (state.attempt && JSON.stringify(state.attempt) !== JSON.stringify(validated)) throw new Error("Unresolved attempt");
      publish({ ...state, attempt: validated, error: null });
      await persist(state);
      assertActive();
    },
    async completeAttempt(key: string) {
      assertActive();
      if (state.attempt?.key !== key) throw new Error("Attempt changed");
      const next = { items: {}, attempt: null, ready: true, error: null };
      await persist(next);
      assertActive();
      publish(next);
    },
    async releaseRejectedAttempt(key: string, status: number) {
      assertActive();
      if (![400, 413, 415, 422, 429].includes(status) || state.attempt?.key !== key) throw new Error("Outcome not confirmed as rejected");
      const next = { ...state, attempt: null, error: null };
      await persist(next);
      assertActive();
      publish(next);
    },
  };
}

export function createAccountCartState(storage: AccountStorage) {
  let current: { owner: string | null; version: number | undefined; cart: ReturnType<typeof createCartState> } | null = null;
  return {
    forAccount(email?: string | null, version?: number) {
      const owner = normalizeAccountOwner(email);
      if (!current || current.owner !== owner || current.version !== version) {
        current?.cart.deactivate();
        current = { owner, version, cart: createCartState(storage, owner) };
      }
      return current.cart;
    },
  };
}
