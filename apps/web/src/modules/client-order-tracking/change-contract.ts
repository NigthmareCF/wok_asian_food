import { isUuid } from "@/modules/checkout/pickup-contract";
export type OrderChange = {
  id: string;
  orderRequestId: string;
  orderCode: string;
  requestType: "CANCEL_ORDER";
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  reason: string;
  decisionReason?: string | null;
  expectedOrderVersion: number;
  version: number;
  requestedAt: string;
  decidedAt?: string | null;
};
export function isOrderChange(value: unknown): value is OrderChange {
  if (!value || typeof value !== "object") return false;
  const x = value as Record<string, unknown>;
  return (
    isUuid(x.id) &&
    isUuid(x.orderRequestId) &&
    typeof x.orderCode === "string" &&
    x.requestType === "CANCEL_ORDER" &&
    ["PENDING_REVIEW", "APPROVED", "REJECTED"].includes(String(x.status)) &&
    typeof x.reason === "string" &&
    (x.decisionReason == null || typeof x.decisionReason === "string") &&
    Number.isSafeInteger(x.expectedOrderVersion) &&
    Number(x.expectedOrderVersion) > 0 &&
    Number.isSafeInteger(x.version) &&
    Number(x.version) > 0 &&
    typeof x.requestedAt === "string" &&
    Number.isFinite(Date.parse(x.requestedAt)) &&
    (x.decidedAt == null ||
      (typeof x.decidedAt === "string" &&
        Number.isFinite(Date.parse(x.decidedAt))))
  );
}
export const isOrderChanges = (value: unknown): value is OrderChange[] =>
  Array.isArray(value) && value.every(isOrderChange);
export const isOptionalOrderChange = (
  value: unknown,
): value is OrderChange | null => value === null || isOrderChange(value);
export function parseCancellation(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    !("reason" in value) ||
    typeof value.reason !== "string"
  )
    return null;
  const reason = value.reason.trim();
  const characters = Array.from(reason).length;
  return characters >= 3 && characters <= 500 ? { reason } : null;
}
export function parseChangeDecision(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const x = value as Record<string, unknown>;
  if (
    !["APPROVE", "REJECT"].includes(String(x.decision)) ||
    !Number.isSafeInteger(x.expectedVersion) ||
    Number(x.expectedVersion) < 1 ||
    (x.reason != null && typeof x.reason !== "string")
  )
    return null;
  const reason = typeof x.reason === "string" ? x.reason.trim() : "";
  const characters = Array.from(reason).length;
  if (
    (reason && (characters < 3 || characters > 500)) ||
    (x.decision === "REJECT" && !reason) || (x.override!==undefined&&typeof x.override!=="boolean")
  )
    return null;
  return {
    decision: x.decision,
    expectedVersion: x.expectedVersion,
    reason: reason || null,
    ...(x.override===undefined?{}:{override:x.override===true}),
  };
}
