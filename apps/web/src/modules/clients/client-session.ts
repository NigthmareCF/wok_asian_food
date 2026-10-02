import type { ClientOrderTrackingSnapshot } from "@/modules/client-order-tracking/order-tracking";

export type ClientOrderLine = Readonly<{
  id: string;
  productId: string;
  title: string;
  quantity: number;
  selectedOptions: Readonly<Record<string, string>>;
  detail?: string;
  unitPriceCents?: number;
}>;
export type ClientOrder = ClientOrderTrackingSnapshot &
  Readonly<{
    createdAt: string;
    lines: readonly ClientOrderLine[];
    subtotalCents?: number;
  }>;
export type CreateClientOrderInput = {
  fulfillment: ClientOrder["fulfillment"];
  lines: readonly (ClientOrderLine & { unitPriceCents: number })[];
  subtotalCents: number;
};
export type ReservationDraft = {
  date: string;
  time: string;
  people: number;
  includesPreorder: boolean | null;
  note: string;
  serviceTime: string;
};
export type LocalReservation = Readonly<
  ReservationDraft & {
    id: string;
    createdAt: string;
    status: "pending";
  }
>;
export type LocalMessage = Readonly<{
  id: string;
  text: string;
  createdAt: string;
  status: "local";
  orderId?: string;
}>;
export type ClientSession = Readonly<{
  orders: readonly ClientOrder[];
  reservationDraft: ReservationDraft | null;
  reservation: LocalReservation | null;
  messages: Readonly<Record<string, readonly LocalMessage[]>>;
  drafts: Readonly<Record<string, string>>;
}>;

export const emptyClientSession: ClientSession = {
  orders: [],
  reservationDraft: null,
  reservation: null,
  messages: {},
  drafts: {},
};

export function localDate(now: Date) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Estado de sesión sin transporte. La creación recibe datos ya revalidados por C-09. */
export function createClientSessionStore(
  initial: ClientSession = emptyClientSession,
) {
  let state = initial;
  let sequence = 0;
  const listeners = new Set<() => void>();
  function update(next: ClientSession) {
    state = next;
    listeners.forEach((listener) => listener());
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    updateReservation(draft: ReservationDraft) {
      update({ ...state, reservationDraft: { ...draft }, reservation: null });
    },
    saveReservation(draft: ReservationDraft) {
      if (state.reservation) return state.reservation;
      const reservation: LocalReservation = Object.freeze({
        ...draft,
        id: `local-reservation-${++sequence}`,
        createdAt: new Date().toISOString(),
        status: "pending",
      });
      update({ ...state, reservationDraft: { ...draft }, reservation });
      return reservation;
    },
    createOrder(input: CreateClientOrderInput) {
      if (
        !input.lines.length ||
        !["table", "pickup", "delivery"].includes(input.fulfillment) ||
        !Number.isSafeInteger(input.subtotalCents) ||
        input.subtotalCents < 0 ||
        input.lines.some(
          (line) =>
            !Number.isSafeInteger(line.quantity) ||
            line.quantity < 1 ||
            !Number.isSafeInteger(line.unitPriceCents) ||
            line.unitPriceCents < 0,
        )
      ) {
        return null;
      }
      const lines = Object.freeze(
        input.lines.map((line) =>
          Object.freeze({
            id: line.id,
            productId: line.productId,
            title: line.title,
            quantity: line.quantity,
            detail: line.detail,
            ...(input.fulfillment !== "table"
              ? { unitPriceCents: line.unitPriceCents }
              : {}),
            selectedOptions: Object.freeze({ ...line.selectedOptions }),
          }),
        ),
      );
      const order: ClientOrder = Object.freeze({
        id: `local-order-${crypto.randomUUID()}`,
        createdAt: new Date().toISOString(),
        summary: lines
          .map((line) => `${line.quantity} × ${line.title}`)
          .join(" · "),
        fulfillment: input.fulfillment,
        lines,
        ...(input.fulfillment !== "table"
          ? { subtotalCents: input.subtotalCents }
          : {}),
        status: "pending",
        restaurantStage: "pending",
        changes: Object.freeze([]),
        ...(input.fulfillment === "delivery"
          ? { deliveryStage: "pending" as const }
          : {}),
      });
      update({ ...state, orders: [order, ...state.orders] });
      return order;
    },
    setMessageDraft(conversationId: string, text: string) {
      update({ ...state, drafts: { ...state.drafts, [conversationId]: text } });
    },
    saveMessage(conversationId: string, orderId?: string) {
      const text = state.drafts[conversationId]?.trim();
      if (!text) return;
      const message: LocalMessage = {
        id: `local-message-${++sequence}`,
        text,
        createdAt: new Date().toISOString(),
        status: "local",
        orderId,
      };
      update({
        ...state,
        messages: {
          ...state.messages,
          [conversationId]: [
            ...(state.messages[conversationId] ?? []),
            message,
          ],
        },
        drafts: { ...state.drafts, [conversationId]: "" },
      });
    },
  };
}

export function findDeliveryOrder(orders: readonly ClientOrder[]) {
  const deliveryOrders = orders
    .filter((order) => order.fulfillment === "delivery")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    deliveryOrders.find((order) => order.status !== "delivered") ??
    deliveryOrders[0]
  );
}
