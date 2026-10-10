export type PickupRequest = {
  requestedFor: string;
  customerNote: string;
  items: { menuItemId: string; quantity: number }[];
};
export type PickupReceipt = {
  requestId: string;
  status: string;
  requestedFor: string;
  subtotal: number;
  currency: string;
  orderId?: string | null;
  orderStatus?: string | null;
  idempotentReplay: boolean;
};
export const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object";
const instant = (value: unknown): value is string =>
  typeof value === "string" &&
  /Z$/.test(value) &&
  Number.isFinite(Date.parse(value));

export function parsePickupRequest(value: unknown): PickupRequest | null {
  if (
    !record(value) ||
    !instant(value.requestedFor) ||
    typeof value.customerNote !== "string" ||
    value.customerNote.length > 500 ||
    !Array.isArray(value.items) ||
    value.items.length < 1 ||
    value.items.length > 20
  )
    return null;
  const items: PickupRequest["items"] = [];
  for (const item of value.items) {
    if (
      !record(item) ||
      !isUuid(item.menuItemId) ||
      !Number.isSafeInteger(item.quantity) ||
      Number(item.quantity) < 1 ||
      Number(item.quantity) > 50
    )
      return null;
    items.push({
      menuItemId: item.menuItemId,
      quantity: Number(item.quantity),
    });
  }
  if (new Set(items.map((item) => item.menuItemId)).size !== items.length)
    return null;
  return {
    requestedFor: value.requestedFor,
    customerNote: value.customerNote.trim(),
    items,
  };
}

export function isPickupReceipt(value: unknown): value is PickupReceipt {
  return (
    record(value) &&
    isUuid(value.requestId) &&
    typeof value.status === "string" &&
    ["PENDING_REVIEW", "ACCEPTED", "REJECTED", "CANCELLED", "EXPIRED"].includes(
      value.status,
    ) &&
    instant(value.requestedFor) &&
    typeof value.subtotal === "number" &&
    Number.isFinite(value.subtotal) &&
    value.subtotal >= 0 &&
    typeof value.currency === "string" &&
    /^[A-Z]{3}$/.test(value.currency) &&
    (value.orderId === undefined ||
      value.orderId === null ||
      isUuid(value.orderId)) &&
    (value.orderStatus === undefined ||
      value.orderStatus === null ||
      (typeof value.orderStatus === "string" &&
        [
          "SENT",
          "PREPARING",
          "READY",
          "SERVED",
          "CLOSED",
          "CANCELLED",
        ].includes(value.orderStatus))) &&
    ((value.orderId === undefined && value.orderStatus === undefined) ||
      (value.orderId === null && value.orderStatus === null) ||
      (isUuid(value.orderId) && typeof value.orderStatus === "string")) &&
    typeof value.idempotentReplay === "boolean"
  );
}
