import { isUuid } from "@/modules/checkout/pickup-contract";
import { instant, record } from "@/modules/client-workflows/validation";
import {
  count,
  money,
  note,
  optional,
  positive,
  text,
  parseStatus,
} from "@/modules/operation/live-validation";

export const orderStatuses = [
  "SENT",
  "PREPARING",
  "READY",
  "SERVED",
  "CLOSED",
  "CANCELLED",
] as const;
export type OrderStatus = (typeof orderStatuses)[number];
export const ticketStatuses = [
  "QUEUED",
  "PREPARING",
  "READY",
  "RECALLED",
  "CANCELLED",
] as const;
export type TicketStatus = (typeof ticketStatuses)[number];
export type OrderSummary = {
  id: string;
  code: string;
  status: OrderStatus;
  channel: "DINE_IN" | "PICKUP" | "DELIVERY";
  subtotal: number;
  discount: number;
  total: number;
  currency: string;
  currencyId: string;
  guestCount: number;
  openedAt: string;
  closedAt?: string | null;
  rowVersion: number;
  diningTableId?: string | null;
  diningTableName?: string | null;
  accountId: string;
  accountName: string;
  itemCount: number;
};
export type OrderLine = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  fulfillment: "DINE_IN" | "TAKEAWAY";
  notes?: string | null;
  preparationAreaId: string;
  stationCode: string;
};
export type OrderTicket = {
  id: string;
  sequence: number;
  status: TicketStatus;
  claimedBy?: string | null;
  readyAt?: string | null;
  estimatedReadyAt?: string | null;
  rowVersion: number;
  stationId: string;
  stationCode: string;
};
export type OrderDetails = {
  order: OrderSummary;
  items: OrderLine[];
  tickets: OrderTicket[];
};
export type OrderReceipt = Pick<
  OrderSummary,
  | "code"
  | "status"
  | "channel"
  | "subtotal"
  | "discount"
  | "total"
  | "currency"
  | "rowVersion"
  | "itemCount"
> & { orderId: string; idempotentReplay: boolean };
export type CreateOrder = {
  accountId: string;
  channel: "DINE_IN" | "PICKUP" | "DELIVERY";
  guestCount: number;
  notes?: string;
  items: {
    menuItemId: string;
    quantity: number;
    fulfillment: "DINE_IN" | "TAKEAWAY";
    notes?: string;
  }[];
};
const channel = (v: unknown) =>
  typeof v === "string" && ["DINE_IN", "PICKUP", "DELIVERY"].includes(v);
const totals = (v: Record<string, unknown>) =>
  money(v.subtotal) &&
  money(v.discount) &&
  money(v.total) &&
  typeof v.currency === "string" &&
  /^[A-Z]{3}$/.test(v.currency);
export function isOrderSummary(v: unknown): v is OrderSummary {
  return (
    record(v) &&
    isUuid(v.id) &&
    text(v.code) &&
    orderStatuses.includes(v.status as OrderStatus) &&
    channel(v.channel) &&
    totals(v) &&
    isUuid(v.currencyId) &&
    positive(v.guestCount) &&
    instant(v.openedAt) &&
    optional(v.closedAt, instant) &&
    positive(v.rowVersion) &&
    optional(v.diningTableId, isUuid) &&
    optional(v.diningTableName, text) &&
    isUuid(v.accountId) &&
    text(v.accountName) &&
    count(v.itemCount)
  );
}
export const isOrderSummaries = (v: unknown): v is OrderSummary[] =>
  Array.isArray(v) && v.every(isOrderSummary);
export function isOrderLine(v: unknown): v is OrderLine {
  return (
    record(v) &&
    isUuid(v.id) &&
    text(v.name) &&
    positive(v.quantity) &&
    money(v.unitPrice) &&
    money(v.lineTotal) &&
    typeof v.fulfillment === "string" &&
    ["DINE_IN", "TAKEAWAY"].includes(v.fulfillment) &&
    note(v.notes, 300) &&
    isUuid(v.preparationAreaId) &&
    text(v.stationCode)
  );
}
export function isOrderTicket(v: unknown): v is OrderTicket {
  return (
    record(v) &&
    isUuid(v.id) &&
    positive(v.sequence) &&
    ticketStatuses.includes(v.status as TicketStatus) &&
    optional(v.claimedBy, isUuid) &&
    optional(v.readyAt, instant) &&
    optional(v.estimatedReadyAt, instant) &&
    positive(v.rowVersion) &&
    isUuid(v.stationId) &&
    text(v.stationCode)
  );
}
export function isOrderDetails(v: unknown): v is OrderDetails {
  return (
    record(v) &&
    isOrderSummary(v.order) &&
    Array.isArray(v.items) &&
    v.items.every(isOrderLine) &&
    Array.isArray(v.tickets) &&
    v.tickets.every(isOrderTicket)
  );
}
export function isOrderReceipt(v: unknown): v is OrderReceipt {
  return (
    record(v) &&
    isUuid(v.orderId) &&
    text(v.code) &&
    orderStatuses.includes(v.status as OrderStatus) &&
    channel(v.channel) &&
    totals(v) &&
    positive(v.rowVersion) &&
    count(v.itemCount) &&
    typeof v.idempotentReplay === "boolean"
  );
}
export function parseCreateOrder(v: unknown): CreateOrder | null {
  if (
    !record(v) ||
    !isUuid(v.accountId) ||
    !channel(v.channel) ||
    !positive(v.guestCount) ||
    !note(v.notes, 500) ||
    !Array.isArray(v.items) ||
    v.items.length < 1 ||
    v.items.length > 50
  )
    return null;
  const items: CreateOrder["items"] = [];
  for (const line of v.items) {
    if (
      !record(line) ||
      !isUuid(line.menuItemId) ||
      !positive(line.quantity) ||
      typeof line.fulfillment !== "string" ||
      !["DINE_IN", "TAKEAWAY"].includes(line.fulfillment) ||
      !note(line.notes, 300)
    )
      return null;
    items.push({
      menuItemId: line.menuItemId,
      quantity: line.quantity,
      fulfillment: line.fulfillment as "DINE_IN" | "TAKEAWAY",
      ...(typeof line.notes === "string" ? { notes: line.notes.trim() } : {}),
    });
  }
  if (new Set(items.map((i) => i.menuItemId)).size !== items.length)
    return null;
  return {
    accountId: v.accountId,
    channel: v.channel as CreateOrder["channel"],
    guestCount: v.guestCount,
    ...(typeof v.notes === "string" ? { notes: v.notes.trim() } : {}),
    items,
  };
}
export const parseOrderStatus = (v: unknown) => parseStatus(v, orderStatuses);
