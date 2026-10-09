import { isUuid } from "@/modules/checkout/pickup-contract";
import { instant, record } from "@/modules/client-workflows/validation";

const statuses = [
  "SENT",
  "PREPARING",
  "READY",
  "SERVED",
  "CLOSED",
  "CANCELLED",
] as const;
const channels = ["DINE_IN", "PICKUP", "DELIVERY"] as const;
const fulfillments = ["DINE_IN", "TAKEAWAY"] as const;

export type OperationalOrderStatus = (typeof statuses)[number];

export type OperationalOrderSummary = {
  id: string;
  code: string;
  status: OperationalOrderStatus;
  channel: (typeof channels)[number];
  subtotal: number;
  discount: number;
  total: number;
  guestCount: number;
  openedAt: string;
  closedAt: string | null;
  rowVersion: number;
  currencyId: string;
  currency: string;
  diningTableId: string | null;
  diningTableName: string | null;
  accountId: string;
  accountName: string;
  itemCount: number;
};

export type OperationalOrderLine = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  fulfillment: (typeof fulfillments)[number];
  notes: string | null;
  preparationAreaId: string;
  stationCode: string;
};

export type OperationalOrderTicket = {
  id: string;
  sequence: number;
  status: string;
  claimedBy: string | null;
  readyAt: string | null;
  estimatedReadyAt: string | null;
  rowVersion: number;
  stationId: string;
  stationCode: string;
};

export type OperationalOrderDetails = {
  order: OperationalOrderSummary;
  items: OperationalOrderLine[];
  tickets: OperationalOrderTicket[];
};

export type CreateOperationalOrder = {
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

export type OperationalOrderReceipt = {
  orderId: string;
  code: string;
  status: OperationalOrderStatus;
  channel: "DINE_IN" | "PICKUP" | "DELIVERY";
  subtotal: number;
  discount: number;
  total: number;
  currency: string;
  rowVersion: number;
  itemCount: number;
  idempotentReplay: boolean;
};

const nonNegativeNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const positiveInteger = (value: unknown) =>
  Number.isSafeInteger(value) && Number(value) > 0;
const nullableInstant = (value: unknown) => value == null || instant(value);

export function isOperationalOrderSummary(
  value: unknown,
): value is OperationalOrderSummary {
  return (
    record(value) &&
    isUuid(value.id) &&
    typeof value.code === "string" &&
    statuses.includes(value.status as OperationalOrderStatus) &&
    channels.includes(value.channel as OperationalOrderSummary["channel"]) &&
    nonNegativeNumber(value.subtotal) &&
    nonNegativeNumber(value.discount) &&
    nonNegativeNumber(value.total) &&
    positiveInteger(value.guestCount) &&
    instant(value.openedAt) &&
    nullableInstant(value.closedAt) &&
    positiveInteger(value.rowVersion) &&
    isUuid(value.currencyId) &&
    typeof value.currency === "string" &&
    (value.diningTableId == null || isUuid(value.diningTableId)) &&
    (value.diningTableName == null ||
      typeof value.diningTableName === "string") &&
    isUuid(value.accountId) &&
    typeof value.accountName === "string" &&
    Number.isSafeInteger(value.itemCount) &&
    Number(value.itemCount) >= 0
  );
}

export function isOperationalOrderSummaries(
  value: unknown,
): value is OperationalOrderSummary[] {
  return Array.isArray(value) && value.every(isOperationalOrderSummary);
}

function isOrderLine(value: unknown): value is OperationalOrderLine {
  return (
    record(value) &&
    isUuid(value.id) &&
    typeof value.name === "string" &&
    positiveInteger(value.quantity) &&
    nonNegativeNumber(value.unitPrice) &&
    nonNegativeNumber(value.lineTotal) &&
    fulfillments.includes(
      value.fulfillment as OperationalOrderLine["fulfillment"],
    ) &&
    (value.notes == null || typeof value.notes === "string") &&
    isUuid(value.preparationAreaId) &&
    typeof value.stationCode === "string"
  );
}

function isOrderTicket(value: unknown): value is OperationalOrderTicket {
  return (
    record(value) &&
    isUuid(value.id) &&
    positiveInteger(value.sequence) &&
    typeof value.status === "string" &&
    (value.claimedBy == null || isUuid(value.claimedBy)) &&
    nullableInstant(value.readyAt) &&
    nullableInstant(value.estimatedReadyAt) &&
    positiveInteger(value.rowVersion) &&
    isUuid(value.stationId) &&
    typeof value.stationCode === "string"
  );
}

export function isOperationalOrderDetails(
  value: unknown,
): value is OperationalOrderDetails {
  return (
    record(value) &&
    isOperationalOrderSummary(value.order) &&
    Array.isArray(value.items) &&
    value.items.every(isOrderLine) &&
    Array.isArray(value.tickets) &&
    value.tickets.every(isOrderTicket)
  );
}

export function parseOperationalOrderStatus(value: unknown) {
  if (
    !record(value) ||
    !statuses.includes(value.status as OperationalOrderStatus) ||
    !positiveInteger(value.expectedVersion) ||
    (value.reason != null &&
      (typeof value.reason !== "string" || value.reason.length > 300))
  )
    return null;
  return {
    status: value.status as OperationalOrderStatus,
    expectedVersion: Number(value.expectedVersion),
    ...(typeof value.reason === "string" && value.reason.trim()
      ? { reason: value.reason.trim() }
      : {}),
  };
}

export function parseCreateOperationalOrder(
  value: unknown,
): CreateOperationalOrder | null {
  if (
    !record(value) ||
    !isUuid(value.accountId) ||
    !channels.includes(value.channel as CreateOperationalOrder["channel"]) ||
    !positiveInteger(value.guestCount) ||
    (value.notes != null &&
      (typeof value.notes !== "string" || value.notes.length > 500)) ||
    !Array.isArray(value.items) ||
    value.items.length === 0 ||
    value.items.length > 50
  )
    return null;
  const items: CreateOperationalOrder["items"] = [];
  for (const item of value.items) {
    if (
      !record(item) ||
      !isUuid(item.menuItemId) ||
      !positiveInteger(item.quantity) ||
      !fulfillments.includes(
        item.fulfillment as CreateOperationalOrder["items"][number]["fulfillment"],
      ) ||
      (item.notes != null &&
        (typeof item.notes !== "string" || item.notes.length > 300))
    )
      return null;
    items.push({
      menuItemId: item.menuItemId,
      quantity: Number(item.quantity),
      fulfillment: item.fulfillment as "DINE_IN" | "TAKEAWAY",
      ...(typeof item.notes === "string" && item.notes.trim()
        ? { notes: item.notes.trim() }
        : {}),
    });
  }
  if (new Set(items.map((item) => item.menuItemId)).size !== items.length)
    return null;
  return {
    accountId: value.accountId,
    channel: value.channel as CreateOperationalOrder["channel"],
    guestCount: Number(value.guestCount),
    ...(typeof value.notes === "string" && value.notes.trim()
      ? { notes: value.notes.trim() }
      : {}),
    items,
  };
}

export function parseAddOperationalOrderItems(value: unknown) {
  if (
    !record(value) ||
    !Array.isArray(value.items) ||
    !value.items.length ||
    value.items.length > 50
  )
    return null;
  const parsed = parseCreateOperationalOrder({
    accountId: "11111111-1111-4111-8111-111111111111",
    channel: "DINE_IN",
    guestCount: 1,
    items: value.items,
  });
  return parsed ? { items: parsed.items } : null;
}

export function isOperationalOrderReceipt(
  value: unknown,
): value is OperationalOrderReceipt {
  return (
    record(value) &&
    isUuid(value.orderId) &&
    typeof value.code === "string" &&
    statuses.includes(value.status as OperationalOrderStatus) &&
    channels.includes(value.channel as OperationalOrderReceipt["channel"]) &&
    nonNegativeNumber(value.subtotal) &&
    nonNegativeNumber(value.discount) &&
    nonNegativeNumber(value.total) &&
    typeof value.currency === "string" &&
    positiveInteger(value.rowVersion) &&
    Number.isSafeInteger(value.itemCount) &&
    Number(value.itemCount) > 0 &&
    typeof value.idempotentReplay === "boolean"
  );
}
