import {
  isPickupReceipt,
  parsePickupRequest,
  type PickupRequest,
  type PickupReceipt,
} from "@/modules/checkout/pickup-contract";
export type DeliveryRequest = PickupRequest & {
  address: string;
  reference: string;
  contactPhone: string;
  paymentPreference: "CASH_ON_DELIVERY" | "ONLINE_PAYMENT_REQUESTED";
};
export type DeliveryReceipt = PickupReceipt & {
  fulfillmentType: "DELIVERY";
  paymentPreference: DeliveryRequest["paymentPreference"];
  message: string;
};
export function parseDeliveryRequest(value: unknown): DeliveryRequest | null {
  const pickup = parsePickupRequest(value);
  if (!pickup || !value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.address !== "string" ||
    v.address.trim().length < 5 ||
    v.address.length > 500 ||
    typeof v.reference !== "string" ||
    v.reference.length > 300 ||
    typeof v.contactPhone !== "string" ||
    !/^[0-9+() .-]{7,32}$/.test(v.contactPhone.trim()) ||
    !["CASH_ON_DELIVERY", "ONLINE_PAYMENT_REQUESTED"].includes(
      String(v.paymentPreference),
    )
  )
    return null;
  return {
    ...pickup,
    address: v.address.trim(),
    reference: v.reference.trim(),
    contactPhone: v.contactPhone.trim(),
    paymentPreference:
      v.paymentPreference as DeliveryRequest["paymentPreference"],
  };
}
export function isDeliveryReceipt(value: unknown): value is DeliveryReceipt {
  return (
    isPickupReceipt(value) &&
    "fulfillmentType" in value &&
    value.fulfillmentType === "DELIVERY" &&
    "paymentPreference" in value &&
    ["CASH_ON_DELIVERY", "ONLINE_PAYMENT_REQUESTED"].includes(
      String(value.paymentPreference),
    ) &&
    "message" in value &&
    typeof value.message === "string"
  );
}
export const isDeliveryHistory = (v: unknown): v is DeliveryReceipt[] =>
  Array.isArray(v) && v.every(isDeliveryReceipt);
export type DeliveryDetails = Omit<
  DeliveryReceipt,
  "message" | "idempotentReplay"
> & {
  customerNote?: string | null;
  items: {
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
};
export function isDeliveryDetails(v: unknown): v is DeliveryDetails {
  if (
    !v ||
    typeof v !== "object" ||
    !isDeliveryReceipt({ ...v, message: "", idempotentReplay: false })
  )
    return false;
  const x = v as Record<string, unknown>;
  return (
    (x.customerNote == null || typeof x.customerNote === "string") &&
    Array.isArray(x.items) &&
    x.items.every(
      (i) =>
        i &&
        typeof i.name === "string" &&
        Number.isSafeInteger(i.quantity) &&
        i.quantity > 0 &&
        typeof i.unitPrice === "number" &&
        Number.isFinite(i.unitPrice) &&
        i.unitPrice >= 0 &&
        typeof i.lineTotal === "number" &&
        Number.isFinite(i.lineTotal) &&
        i.lineTotal >= 0,
    )
  );
}
