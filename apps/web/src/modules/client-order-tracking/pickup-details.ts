import {
  isPickupReceipt,
  isUuid,
  type PickupReceipt,
} from "@/modules/checkout/pickup-contract";

export type PickupDetails = Omit<PickupReceipt, "idempotentReplay"> & {
  customerNote?: string | null;
  items: {
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    currencyId: string;
  }[];
};
export const pickupStatusLabels: Record<string, string> = {
  PENDING_REVIEW: "Pendiente de revisión",
  ACCEPTED: "Aceptada",
  REJECTED: "Rechazada",
  CANCELLED: "Cancelada",
  EXPIRED: "Vencida",
};
export const requestStatusDescriptions: Record<string, string> = {
  PENDING_REVIEW:
    "El restaurante debe revisar tu solicitud. Este comprobante no confirma disponibilidad ni registra un pago.",
  ACCEPTED:
    "El restaurante aceptó tu solicitud. Consulta el detalle para seguir el pedido. Este comprobante no registra un pago.",
  REJECTED:
    "El restaurante rechazó esta solicitud. Este comprobante no registra un pago.",
  CANCELLED:
    "Esta solicitud fue cancelada. Este comprobante no registra un pago.",
  EXPIRED: "Esta solicitud venció. Este comprobante no registra un pago.",
};
export const pickupOrderStatusLabels: Record<string, string> = {
  SENT: "Pedido enviado a cocina",
  PREPARING: "En preparación",
  READY: "Listo para recoger",
  SERVED: "Entregado",
  CLOSED: "Pedido cerrado",
  CANCELLED: "Pedido cancelado",
};
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object";
const amount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
export const isPickupHistory = (value: unknown): value is PickupReceipt[] =>
  Array.isArray(value) && value.every(isPickupReceipt);
export function isPickupDetails(value: unknown): value is PickupDetails {
  return (
    record(value) &&
    isPickupReceipt({ ...value, idempotentReplay: false }) &&
    (value.customerNote == null || typeof value.customerNote === "string") &&
    Array.isArray(value.items) &&
    value.items.every(
      (item) =>
        record(item) &&
        typeof item.name === "string" &&
        Number.isSafeInteger(item.quantity) &&
        Number(item.quantity) > 0 &&
        amount(item.unitPrice) &&
        amount(item.lineTotal) &&
        isUuid(item.currencyId),
    )
  );
}
export function isPickupCancellation(
  value: unknown,
): value is { requestId: string; status: "CANCELLED" } {
  return (
    record(value) && isUuid(value.requestId) && value.status === "CANCELLED"
  );
}
export const formatPickupMoney = (value: number, currency: string) =>
  new Intl.NumberFormat("es-GT", { style: "currency", currency }).format(value);
