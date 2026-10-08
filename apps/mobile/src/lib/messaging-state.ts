import { z } from "zod";
import { ApiError } from "./api-client";

const instant = z.iso.datetime({ offset: true });
export const conversationSchema = z.object({
  conversationId: z.uuid(),
  status: z.enum(["OPEN", "WAITING", "CLOSED"]),
  updatedAt: instant,
});
export const messageSchema = z.object({
  messageId: z.uuid(),
  senderType: z.enum(["CUSTOMER", "HUMAN", "SYSTEM"]),
  body: z.string().min(1).max(4000),
  status: z.string().min(1),
  createdAt: instant,
});
const receiptSchema = z.object({
  messageId: z.uuid(),
  status: z.string().min(1),
  createdAt: instant,
  idempotentReplay: z.boolean(),
});
const legacyPendingSchema = z.object({
  key: z.uuid(),
  body: z
    .string()
    .min(1)
    .max(4000)
    .refine((body) => Boolean(body.trim())),
});
const pendingSchema = legacyPendingSchema.extend({
  owner: z.string().min(1),
  conversationId: z.uuid(),
  confirmed: z.boolean().default(false),
});
export type Conversation = z.infer<typeof conversationSchema>;
export type Message = z.infer<typeof messageSchema>;
export type PendingMessage = z.infer<typeof pendingSchema>;
export type MessagingStorage = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<unknown>;
  deleteItemAsync: (key: string) => Promise<unknown>;
  clearOwner?: (owner: string) => void;
};

export function createMessagingStorage(
  platform: string,
  native: MessagingStorage,
): MessagingStorage {
  if (platform !== "web") return native;
  // Screen-private memory: no persisted browser message content or shared account map.
  const values = new Map<string, string>();
  return {
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => {
      values.set(key, value);
    },
    deleteItemAsync: async (key) => {
      values.delete(key);
    },
    clearOwner: (owner) => {
      const prefix = messagingStorageKey(owner, "");
      for (const key of values.keys())
        if (key.startsWith(prefix)) values.delete(key);
    },
  };
}

export function messagingStorageKey(owner: string, conversationId: string) {
  const encodedOwner = Array.from(owner)
    .map((character) => character.codePointAt(0)!.toString(16))
    .join("-");
  return `wok.messaging.pending.owner.${encodedOwner}.${conversationId}`;
}
const legacyStorageKey = (conversationId: string) =>
  `wok.messaging.pending.${conversationId}`;

// Legacy data is accepted only after an authenticated owned conversation history loads.
export function parsePending(
  raw: string,
  owner: string,
  conversationId: string,
): PendingMessage {
  const value: unknown = JSON.parse(raw);
  const scoped = pendingSchema.safeParse(value);
  if (scoped.success) {
    if (
      scoped.data.owner !== owner ||
      scoped.data.conversationId !== conversationId
    )
      throw new Error("Pending owner mismatch");
    return scoped.data;
  }
  if (
    typeof value !== "object" ||
    value === null ||
    "owner" in value ||
    "conversationId" in value ||
    "confirmed" in value
  )
    throw new Error("Invalid scoped pending message");
  return {
    ...legacyPendingSchema.parse(value),
    owner,
    conversationId,
    confirmed: false,
  };
}

export type MessagingSnapshot = {
  conversation: Conversation | null;
  messages: Message[];
  pending: PendingMessage | null;
  historyReady: boolean;
  storageReady: boolean;
  loading: boolean;
  sending: boolean;
  error: string;
  warning: string;
  notice: string;
};
export const initialMessagingSnapshot = (): MessagingSnapshot => ({
  conversation: null,
  messages: [],
  pending: null,
  historyReady: false,
  storageReady: false,
  loading: false,
  sending: false,
  error: "",
  warning: "",
  notice: "",
});
type Options = {
  owner: string;
  request: (path: string, options?: RequestInit) => Promise<unknown>;
  storage: MessagingStorage;
  uuid: () => string;
  online: boolean;
};

export function createMessagingState({
  owner,
  request,
  storage,
  uuid,
  online,
}: Options) {
  let state = initialMessagingSnapshot();
  let active = true;
  let revision = 0;
  const listeners = new Set<(value: MessagingSnapshot) => void>();
  const update = (patch: Partial<MessagingSnapshot>) => {
    if (!active) return;
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  };
  const errorText = (cause: unknown, fallback: string) =>
    cause instanceof ApiError ? cause.message : fallback;

  async function restore(conversationId: string, current: () => boolean) {
    try {
      const key = messagingStorageKey(owner, conversationId);
      const raw =
        (await storage.getItemAsync(key)) ??
        (await storage.getItemAsync(legacyStorageKey(conversationId)));
      if (!current()) return;
      // In-memory attempts remain authoritative if a previous storage write failed.
      const pending =
        state.pending?.conversationId === conversationId
          ? state.pending
          : raw
            ? parsePending(raw, owner, conversationId)
            : null;
      if (pending) {
        update({ pending });
        await storage.setItemAsync(key, JSON.stringify(pending));
      }
      if (current())
        update({
          pending,
          storageReady: true,
          warning: pending?.confirmed
            ? "El mensaje está confirmado. Actualiza el guardado local antes de enviar otro."
            : "",
        });
    } catch {
      if (current())
        update({
          storageReady: false,
          warning:
            "El historial cargó, pero no pudimos recuperar el envío pendiente. Actualiza antes de enviar; no borraremos datos sin confirmar.",
        });
    }
  }

  async function load() {
    if (!active || state.loading || state.sending) return false;
    const version = ++revision;
    const current = () => active && revision === version;
    update({
      loading: true,
      historyReady: false,
      storageReady: false,
      error: "",
    });
    try {
      const conversations = z
        .array(conversationSchema)
        .parse(await request("/api/v1/client/conversations"));
      if (!current()) return false;
      const conversation =
        (state.pending
          ? conversations.find(
              (item) => item.conversationId === state.pending?.conversationId,
            )
          : undefined) ??
        conversations.find((item) => item.status !== "CLOSED") ??
        null;
      if (!conversation) {
        update({
          conversation: null,
          messages: [],
          historyReady: true,
          storageReady: true,
          warning: "",
        });
        return true;
      }
      const messages = z
        .array(messageSchema)
        .parse(
          await request(
            `/api/v1/client/conversations/${conversation.conversationId}/messages`,
          ),
        );
      if (!current()) return false;
      update({ conversation, messages, historyReady: true });
      await restore(conversation.conversationId, current);
      return current();
    } catch (cause) {
      if (current())
        update({
          error: errorText(
            cause,
            "No pudimos cargar tus mensajes. Actualiza para intentarlo de nuevo.",
          ),
        });
      return false;
    } finally {
      if (current()) update({ loading: false });
    }
  }

  async function start() {
    if (
      !active ||
      !online ||
      !state.historyReady ||
      state.loading ||
      state.sending ||
      state.pending ||
      state.conversation
    )
      return false;
    const version = ++revision;
    const current = () => active && revision === version;
    update({
      loading: true,
      historyReady: false,
      storageReady: false,
      error: "",
      notice: "",
    });
    try {
      const conversation = conversationSchema.parse(
        await request("/api/v1/client/conversations", { method: "POST" }),
      );
      if (!current()) return false;
      // Opening may return an existing conversation; an empty history is not assumed.
      const messages = z
        .array(messageSchema)
        .parse(
          await request(
            `/api/v1/client/conversations/${conversation.conversationId}/messages`,
          ),
        );
      if (!current()) return false;
      update({ conversation, messages, historyReady: true });
      await restore(conversation.conversationId, current);
      return current();
    } catch (cause) {
      if (current())
        update({
          error: errorText(
            cause,
            "No pudimos iniciar o recuperar la conversación. Actualiza antes de continuar.",
          ),
        });
      return false;
    } finally {
      if (current()) update({ loading: false });
    }
  }

  async function cleanup(attempt: PendingMessage) {
    try {
      await storage.deleteItemAsync(legacyStorageKey(attempt.conversationId));
      if (!active) return false;
      await storage.deleteItemAsync(
        messagingStorageKey(owner, attempt.conversationId),
      );
      if (!active) return false;
      update({ pending: null, storageReady: true, warning: "" });
      return true;
    } catch {
      update({
        storageReady: false,
        warning:
          "El servidor confirmó el mensaje, pero falta limpiar el guardado local. Reintenta la limpieza, no el envío.",
      });
      return false;
    }
  }

  async function transmit(attempt: PendingMessage) {
    update({ sending: true, error: "", warning: "" });
    let confirmed = attempt.confirmed;
    try {
      if (!confirmed) {
        // Persistence before transport is mandatory, including an explicit retry.
        try {
          await storage.setItemAsync(
            messagingStorageKey(owner, attempt.conversationId),
            JSON.stringify(attempt),
          );
        } catch {
          update({
            storageReady: false,
            warning:
              "No pudimos guardar el mensaje. No iniciamos el envío; conserva esta pantalla y reintenta.",
          });
          return false;
        }
        if (!active || !online) return false;
        update({ storageReady: true });
        const receipt = await request(
          `/api/v1/client/conversations/${attempt.conversationId}/messages`,
          {
            method: "POST",
            headers: { "Idempotency-Key": attempt.key },
            body: JSON.stringify({ body: attempt.body }),
          },
        );
        receiptSchema.parse(receipt);
        if (!active) return false;
        confirmed = true;
        attempt = { ...attempt, confirmed: true };
        update({
          pending: attempt,
          notice:
            "Mensaje enviado. El equipo WOK te responderá por este medio.",
        });
        // Keep a confirmed marker if cleanup subsequently fails; failure here cannot undo POST.
        try {
          await storage.setItemAsync(
            messagingStorageKey(owner, attempt.conversationId),
            JSON.stringify(attempt),
          );
        } catch {
          /* cleanup below still attempts removal */
        }
        if (!active) return true;
      }
      await cleanup(attempt);
      return true;
    } catch (cause) {
      update({
        error: errorText(
          cause,
          "No se pudo confirmar el envío. Conservamos el mensaje y su clave para reintentar sin duplicarlo.",
        ),
      });
      return false;
    } finally {
      update({ sending: false });
      if (active && confirmed && !state.pending) await load();
    }
  }

  return {
    snapshot: () => state,
    subscribe(listener: (value: MessagingSnapshot) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setOnline(value: boolean) {
      online = value;
    },
    load,
    start,
    async submit(body: string) {
      if (
        !active ||
        !online ||
        !state.historyReady ||
        !state.storageReady ||
        state.loading ||
        state.sending ||
        state.pending ||
        !state.conversation ||
        state.conversation.status === "CLOSED"
      )
        return false;
      const parsed = legacyPendingSchema.safeParse({
        key: uuid(),
        body: body.trim(),
      });
      if (!parsed.success) {
        update({ error: "Escribe un mensaje de hasta 4000 caracteres." });
        return false;
      }
      const attempt = {
        ...parsed.data,
        owner,
        conversationId: state.conversation.conversationId,
        confirmed: false,
      };
      update({ pending: attempt, notice: "" });
      return transmit(attempt);
    },
    async retry() {
      if (
        !active ||
        !online ||
        !state.historyReady ||
        state.loading ||
        state.sending ||
        !state.pending ||
        state.pending.owner !== owner ||
        state.pending.conversationId !== state.conversation?.conversationId ||
        (state.conversation.status === "CLOSED" && !state.pending.confirmed)
      )
        return false;
      return transmit(state.pending);
    },
    dispose() {
      active = false;
      revision++;
      listeners.clear();
    },
  };
}
export type MessagingState = ReturnType<typeof createMessagingState>;
