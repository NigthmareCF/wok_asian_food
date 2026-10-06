import type {
  OrderStatus,
  TicketStatus,
  OrderDetails,
  OrderTicket,
} from "./live-contract";
export const orderLabels: Record<OrderStatus, string> = {
  SENT: "Comandado",
  PREPARING: "En preparación",
  READY: "Listo",
  SERVED: "Servido",
  CLOSED: "Cerrado",
  CANCELLED: "Anulado",
};
export const ticketLabels: Record<TicketStatus, string> = {
  QUEUED: "En cola",
  PREPARING: "En preparación",
  READY: "Listo",
  RECALLED: "Devuelto",
  CANCELLED: "Anulado",
};
export const orderTransitions: Record<OrderStatus, readonly OrderStatus[]> = {
  SENT: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["SERVED", "CANCELLED"],
  SERVED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
};
export const ticketTransitions: Record<TicketStatus, readonly TicketStatus[]> =
  {
    QUEUED: ["PREPARING", "CANCELLED"],
    PREPARING: ["READY", "QUEUED", "CANCELLED"],
    READY: ["RECALLED"],
    RECALLED: ["PREPARING"],
    CANCELLED: [],
  };
export const amount = (value: number, currency: string) =>
  new Intl.NumberFormat("es-GT", { style: "currency", currency }).format(value);
export const ticketLines = (details: OrderDetails, ticket: OrderTicket) =>
  details.items.filter((item) => item.preparationAreaId === ticket.stationId);
