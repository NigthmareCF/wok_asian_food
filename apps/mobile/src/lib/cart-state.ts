import { z } from "zod";
import type { PickupRequestBody } from "./api";

const cartKey = "wok.pickup.cart.v1";
const attemptKey = "wok.pickup.pending.v1";
const itemsSchema = z.record(z.uuid(), z.number().int().min(1).max(50));
const attemptSchema = z.object({
  email: z.string().min(1), key: z.uuid(), body: z.object({
    requestedFor: z.iso.datetime({ offset: true }), customerNote: z.string().max(500).optional(),
    quoteId:z.uuid().optional(),
    items: z.array(z.object({ menuItemId: z.uuid(), quantity: z.number().int().min(1).max(50),modifierIds:z.array(z.uuid()).max(30).optional() })).min(1).max(20),
  }),
});
export type PickupAttempt = { email: string; key: string; body: PickupRequestBody };
type CartState = { items: Record<string, number>; attempt: PickupAttempt | null; ready: boolean; error: string | null };
type Storage = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};

export function createCartState(storage: Storage) {
  let state: CartState = { items: {}, attempt: null, ready: false, error: null };
  const initialState = state;
  const listeners = new Set<() => void>();
  let restoring: Promise<void> | null = null;
  let queue: Promise<void> = Promise.resolve();
  const publish = (next: CartState) => { state = next; listeners.forEach((listener) => listener()); };
  function persist(snapshot: CartState) {
    const task = queue.catch(() => {}).then(async () => {
      await storage.setItemAsync(cartKey, JSON.stringify(snapshot.items));
      if (snapshot.attempt) await storage.setItemAsync(attemptKey, JSON.stringify(snapshot.attempt));
      else await storage.deleteItemAsync(attemptKey);
    });
    queue = task;
    return task;
  }
  return {
    getSnapshot: () => state,
    getServerSnapshot: () => initialState,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    restore() {
      if (state.ready) return Promise.resolve();
      if (!restoring) restoring = (async () => {
        try {
          const [cart, attempt] = await Promise.all([storage.getItemAsync(cartKey), storage.getItemAsync(attemptKey)]);
          publish({ items: cart ? itemsSchema.parse(JSON.parse(cart)) : {},
            attempt: attempt ? attemptSchema.parse(JSON.parse(attempt)) : null, ready: true, error: null });
        } catch { publish({ ...state, error: "No pudimos recuperar el carrito con seguridad. Reintenta antes de editar o enviar." }); }
      })().finally(() => { restoring = null; });
      return restoring;
    },
    changeQuantity(id: string, delta: number) {
      if (!state.ready || state.attempt || !z.uuid().safeParse(id).success || !Number.isInteger(delta)) return;
      const items = { ...state.items };
      const quantity = (items[id] ?? 0) + delta;
      if (quantity > 50) return;
      if (quantity <= 0) delete items[id]; else items[id] = quantity;
      publish({ ...state, items, error: null });
      void persist(state).catch(() => { publish({ ...state, error: "No pudimos guardar el carrito en este dispositivo." }); });
    },
    async prepareAttempt(attempt: PickupAttempt) {
      if (!state.ready) throw new Error("Cart not restored");
      const validated = attemptSchema.parse(attempt);
      if (state.attempt && JSON.stringify(state.attempt) !== JSON.stringify(validated)) throw new Error("Unresolved attempt");
      publish({ ...state, attempt: validated, error: null });
      await persist(state);
    },
    async completeAttempt(key: string) {
      if (state.attempt?.key !== key) throw new Error("Attempt changed");
      const next = { items: {}, attempt: null, ready: true, error: null };
      await persist(next);
      publish(next);
    },
    async releaseRejectedAttempt(key: string, status: number) {
      if (![400, 413, 415, 422, 429].includes(status) || state.attempt?.key !== key) throw new Error("Outcome not confirmed as rejected");
      const next = { ...state, attempt: null, error: null };
      await persist(next);
      publish(next);
    },
  };
}
