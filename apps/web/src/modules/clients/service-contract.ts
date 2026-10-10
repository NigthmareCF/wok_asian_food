import { record } from "@/modules/client-workflows/validation";
export const capabilityLabels = {
  LOCAL: "Servicio local",
  RESERVATIONS: "Reservas",
  DINE_IN_ONLINE: "Pedidos en salón en línea",
  PICKUP: "Recoger",
  DELIVERY: "Delivery",
  ONLINE_ORDERS: "Pedidos en línea",
  MESSAGING: "Mensajes",
  ONLINE_PAYMENTS: "Pagos en línea",
};
export const capabilityStatuses = {
  ENABLED: "Habilitado",
  MANUAL_APPROVAL: "Requiere aprobación",
  PAUSED: "Pausado",
  DISABLED: "Deshabilitado",
};
export type Capability = {
  code: keyof typeof capabilityLabels;
  status: keyof typeof capabilityStatuses;
};
export function isCapabilities(v: unknown): v is Capability[] {
  return (
    Array.isArray(v) &&
    v.every(
      (r) =>
        record(r) &&
        typeof r.code === "string" &&
        Object.hasOwn(capabilityLabels, r.code) &&
        typeof r.status === "string" &&
        Object.hasOwn(capabilityStatuses, r.status),
    )
  );
}
