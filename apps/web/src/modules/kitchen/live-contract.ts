import { isUuid } from "@/modules/checkout/pickup-contract";
import { instant, record } from "@/modules/client-workflows/validation";

const ticketStatuses = [
  "QUEUED",
  "PREPARING",
  "READY",
  "RECALLED",
  "CANCELLED",
] as const;
const itemActions = ["NEW", "INCREASED", "CANCELLED"] as const;
const fulfillmentModes = ["DINE_IN", "TAKEAWAY"] as const;

export type KitchenTicketStatus = (typeof ticketStatuses)[number];

export type KitchenTicketItem = {
  orderItemId: string;
  name: string;
  quantity: number;
  action: (typeof itemActions)[number];
  fulfillment: (typeof fulfillmentModes)[number];
  notes: string | null;
};

export type KitchenTicket = {
  id: string;
  orderId: string;
  orderCode: string;
  sequence: number;
  status: KitchenTicketStatus;
  rowVersion: number;
  stationId: string;
  stationCode: string;
  claimedBy: string | null;
  claimedAt: string | null;
  readyAt: string | null;
  estimatedReadyAt: string | null;
  channel: string;
  diningTableName: string | null;
  accountName: string;
  itemCount: number;
  totalQuantity: number;
  oldestItemAt: string | null;
  items: KitchenTicketItem[];
};

const nullableInstant = (value: unknown) => value == null || instant(value);

function isKitchenTicketItem(value: unknown): value is KitchenTicketItem {
  return (
    record(value) &&
    isUuid(value.orderItemId) &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    Number.isSafeInteger(value.quantity) &&
    Number(value.quantity) > 0 &&
    itemActions.includes(value.action as KitchenTicketItem["action"]) &&
    fulfillmentModes.includes(
      value.fulfillment as KitchenTicketItem["fulfillment"],
    ) &&
    (value.notes == null || typeof value.notes === "string")
  );
}

export function isKitchenTicket(value: unknown): value is KitchenTicket {
  return (
    record(value) &&
    isUuid(value.id) &&
    isUuid(value.orderId) &&
    typeof value.orderCode === "string" &&
    Number.isSafeInteger(value.sequence) &&
    Number(value.sequence) > 0 &&
    ticketStatuses.includes(value.status as KitchenTicketStatus) &&
    Number.isSafeInteger(value.rowVersion) &&
    Number(value.rowVersion) > 0 &&
    isUuid(value.stationId) &&
    typeof value.stationCode === "string" &&
    (value.claimedBy == null || isUuid(value.claimedBy)) &&
    nullableInstant(value.claimedAt) &&
    nullableInstant(value.readyAt) &&
    nullableInstant(value.estimatedReadyAt) &&
    typeof value.channel === "string" &&
    (value.diningTableName == null ||
      typeof value.diningTableName === "string") &&
    typeof value.accountName === "string" &&
    Number.isSafeInteger(value.itemCount) &&
    Number(value.itemCount) >= 0 &&
    Number.isSafeInteger(value.totalQuantity) &&
    Number(value.totalQuantity) >= 0 &&
    nullableInstant(value.oldestItemAt) &&
    Array.isArray(value.items) &&
    value.items.every(isKitchenTicketItem)
  );
}

export function isKitchenTickets(value: unknown): value is KitchenTicket[] {
  return Array.isArray(value) && value.every(isKitchenTicket);
}

export function parseKitchenTicketStatus(value: unknown) {
  if (
    !record(value) ||
    !ticketStatuses.includes(value.status as KitchenTicketStatus) ||
    !Number.isSafeInteger(value.expectedVersion) ||
    Number(value.expectedVersion) <= 0 ||
    Number(value.expectedVersion) > 2147483647 ||
    (value.reason != null &&
      (typeof value.reason !== "string" || value.reason.length > 300))
  )
    return null;
  return {
    status: value.status as KitchenTicketStatus,
    expectedVersion: Number(value.expectedVersion),
    ...(typeof value.reason === "string" && value.reason.trim()
      ? { reason: value.reason.trim() }
      : {}),
  };
}
