import { isUuid } from "@/modules/checkout/pickup-contract";
import { record } from "@/modules/client-workflows/validation";
import {
  parseCreateOperationalOrder,
  parseAddOperationalOrderItems,
} from "./live-contract";
export type OrderAttempt = {
  ownerId?: string;
  accountId: string;
  orderId?: string;
  resultingOrderId?: string;
  url: string;
  body: string;
  key: string;
  uncertain: boolean;
  confirmed: boolean;
};
export function createOrderAttemptStore(
  userId: string | undefined,
  accountId: string | undefined,
  orderId: string | undefined,
) {
  const storageKey =
    userId && accountId
      ? `wok.order.attempt.v1:${userId}:${accountId}:${orderId ?? "new"}`
      : null;
  let loaded = false;
  let value: OrderAttempt | null = null;
  let notice = "";
  const listeners = new Set<() => void>();
  function read() {
    if (loaded || typeof window === "undefined") return value;
    loaded = true;
    if (!storageKey) return value;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return value;
      const candidate: unknown = raw.length < 40000 ? JSON.parse(raw) : null;
      if (
        !record(candidate) ||
        candidate.accountId !== accountId ||
        (candidate.ownerId !== undefined && candidate.ownerId !== userId) ||
        candidate.orderId !== orderId ||
        !isUuid(candidate.key) ||
        typeof candidate.body !== "string" ||
        candidate.url !==
          (orderId
            ? `/bff/operational/orders/${orderId}/items`
            : "/bff/operational/orders")
      )
        throw new Error("Invalid attempt");
      const payload: unknown = JSON.parse(candidate.body);
      const parsed = orderId
        ? parseAddOperationalOrderItems(payload)
        : parseCreateOperationalOrder(payload);
      if (
        !parsed ||
        (!orderId && (!record(payload) || payload.accountId !== accountId))
      )
        throw new Error("Invalid payload");
      value = {
        ownerId: userId,
        accountId: accountId!,
        orderId,
        ...(isUuid(candidate.resultingOrderId)
          ? { resultingOrderId: candidate.resultingOrderId }
          : {}),
        key: candidate.key,
        body: candidate.body,
        url: candidate.url,
        uncertain: candidate.confirmed !== true,
        confirmed: candidate.confirmed === true,
      };
    } catch {
      notice =
        "No pudimos recuperar el intento guardado. Consulta los pedidos de esta cuenta antes de continuar.";
    }
    return value;
  }
  return {
    getSnapshot: read,
    getServerSnapshot: () => null,
    getNotice: () => notice,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    save(next: OrderAttempt | null) {
      if (storageKey) {
        if (next)
          sessionStorage.setItem(
            storageKey,
            JSON.stringify({ ...next, uncertain: !next.confirmed }),
          );
        else sessionStorage.removeItem(storageKey);
      }
      value = next;
      loaded = true;
      listeners.forEach((listener) => listener());
    },
  };
}
