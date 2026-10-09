import { isUuid } from "@/modules/checkout/pickup-contract";
import { instant, record } from "@/modules/client-workflows/validation";

export const orderRequestStatuses = [
  "PENDING_REVIEW",
  "ACCEPTED",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
] as const;
export type OrderRequestStatus = (typeof orderRequestStatuses)[number];

export type OperationalOrderRequest = {
  requestId: string;
  status: OrderRequestStatus;
  fulfillmentType: "PICKUP" | "DELIVERY";
  requestedFor: string;
  submittedAt: string;
  customerName: string;
  customerEmail: string;
  customerNote: string | null;
  subtotal: number;
  currency: string;
  orderId: string | null;
  orderStatus: string | null;
  items: {
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
};

const nonNegative = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

function isOrderRequest(value: unknown): value is OperationalOrderRequest {
  return (
    record(value) &&
    isUuid(value.requestId) &&
    orderRequestStatuses.includes(value.status as OrderRequestStatus) &&
    ["PICKUP", "DELIVERY"].includes(String(value.fulfillmentType)) &&
    instant(value.requestedFor) &&
    instant(value.submittedAt) &&
    typeof value.customerName === "string" &&
    typeof value.customerEmail === "string" &&
    (value.customerNote == null || typeof value.customerNote === "string") &&
    nonNegative(value.subtotal) &&
    typeof value.currency === "string" &&
    (value.orderId == null || isUuid(value.orderId)) &&
    (value.orderStatus == null || typeof value.orderStatus === "string") &&
    Array.isArray(value.items) &&
    value.items.every(
      (item) =>
        record(item) &&
        typeof item.name === "string" &&
        Number.isSafeInteger(item.quantity) &&
        Number(item.quantity) > 0 &&
        nonNegative(item.unitPrice) &&
        nonNegative(item.lineTotal),
    )
  );
}

export function isOperationalOrderRequests(
  value: unknown,
): value is OperationalOrderRequest[] {
  return Array.isArray(value) && value.every(isOrderRequest);
}

export function parseOrderRequestDecision(value: unknown) {
  if (
    !record(value) ||
    (value.action !== "ACCEPT" && value.action !== "REJECT") ||
    (value.reason != null &&
      (typeof value.reason !== "string" || value.reason.length > 500))
  )
    return null;
  const reason = typeof value.reason === "string" ? value.reason.trim() : "";
  if (reason.length > 500 || (value.action === "REJECT" && !reason))
    return null;
  return {
    action: value.action as "ACCEPT" | "REJECT",
    ...(reason ? { reason } : {}),
  };
}

export function isOrderRequestDecisionResult(value: unknown) {
  return (
    record(value) &&
    isUuid(value.requestId) &&
    ((value.status === "ACCEPTED" && isUuid(value.orderId)) ||
      (value.status === "REJECTED" && value.orderId === null)) &&
    typeof value.idempotentReplay === "boolean"
  );
}
