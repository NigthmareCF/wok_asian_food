import { isUuid } from "@/modules/checkout/pickup-contract";
export type Attempt<P, R> = {
  key: string;
  payload: P;
  receipt?: R;
  uncertain?: boolean;
};
// Persistir antes de enviar permite recuperar respuestas perdidas con la misma clave.
export function createAttemptStore<P, R>(
  storageKey: string,
  parse: (v: unknown) => P | null,
  validate: (v: unknown) => v is R,
) {
  let value: Attempt<P, R> | null = null;
  let loaded = false;
  const listeners = new Set<() => void>();
  return {
    getServerSnapshot: () => null,
    getSnapshot() {
      if (!loaded && typeof window !== "undefined") {
        loaded = true;
        try {
          const raw = window.sessionStorage.getItem(storageKey);
          const v = raw && raw.length < 40000 ? JSON.parse(raw) : null;
          const payload = parse(v?.payload);
          if (payload && isUuid(v.key))
            value = {
              key: v.key,
              payload,
              uncertain: v.uncertain !== false,
              ...(validate(v.receipt) ? { receipt: v.receipt } : {}),
            };
        } catch {
          /* No enviar datos inválidos. */
        }
      }
      return value;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    save(next: Attempt<P, R> | null) {
      if (next) window.sessionStorage.setItem(storageKey, JSON.stringify(next));
      else window.sessionStorage.removeItem(storageKey);
      value = next;
      loaded = true;
      listeners.forEach((listener) => listener());
    },
  };
}
