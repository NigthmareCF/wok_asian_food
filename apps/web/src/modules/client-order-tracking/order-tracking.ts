export type ClientOrderStatus =
  "pending" | "confirmed" | "preparing" | "ready" | "delayed" | "delivered";

export type ClientOrderChange = Readonly<{
  kind: "added" | "quantity-updated";
  description: string;
}>;

/** Modelo de seguimiento exclusivo de Cliente; no comparte contratos Operativos. */
export type ClientOrderTrackingSnapshot = Readonly<{
  id: string;
  status: ClientOrderStatus;
  estimatedTime?: string;
  delayMessage?: string;
  changes: readonly ClientOrderChange[];
  fulfillment: "table" | "pickup" | "delivery";
  restaurantStage: "pending" | "confirmed" | "preparing" | "ready";
  deliveryStage?: "pending" | "in-transit" | "delivered";
}>;

export const orderStatusLabels: Record<ClientOrderStatus, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  preparing: "En preparación",
  ready: "Listo",
  delayed: "Retrasado",
  delivered: "Entregado",
};
