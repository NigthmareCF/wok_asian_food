import {
  isPickupReceipt,
  isUuid,
  parsePickupRequest,
  type PickupReceipt,
  type PickupRequest,
} from "./pickup-contract";
export type PickupAttempt = {
  key: string;
  payload: PickupRequest;
  receipt?: PickupReceipt;
};

// La clave y el cuerpo se guardan antes del envío y se conservan ante un resultado incierto.
export function createPickupAttemptStore(userId: string) {
  const storageKey = `wok.pickup.attempt.v1:${userId}`;
  let value: PickupAttempt | null = null;
  let loaded = false;
  const listeners = new Set<() => void>();
  return {
    getServerSnapshot: () => null,
    getSnapshot() {
      if (!loaded && typeof window !== "undefined") {
        loaded = true;
        try {
          const raw = window.sessionStorage.getItem(storageKey);
          const parsed = raw && raw.length < 20_000 ? JSON.parse(raw) : null;
          const payload = parsePickupRequest(parsed?.payload);
          if (payload && isUuid(parsed.key))
            value = {
              key: parsed.key,
              payload,
              ...(isPickupReceipt(parsed.receipt)
                ? { receipt: parsed.receipt }
                : {}),
            };
        } catch {
          /* Se valida el almacenamiento antes de utilizarlo. */
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
    save(next: PickupAttempt | null) {
      // Si el navegador impide guardar, no se inicia una solicitud que no se pueda recuperar.
      if (next) window.sessionStorage.setItem(storageKey, JSON.stringify(next));
      else window.sessionStorage.removeItem(storageKey);
      value = next;
      loaded = true;
      listeners.forEach((listener) => listener());
    },
  };
}
