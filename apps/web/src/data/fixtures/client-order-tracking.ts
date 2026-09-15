import type { ClientOrderTrackingSnapshot } from "@/modules/client-order-tracking/order-tracking";

/** Fixtures temporales de C-10, exclusivos del seguimiento visible para Cliente. */
export const clientOrderTrackingFixtures: readonly ClientOrderTrackingSnapshot[] =
  [
    {
      id: "demo-pending",
      summary: "Solicitud de demostración pendiente.",
      status: "pending",
      changes: [],
      fulfillment: "pickup",
      restaurantStage: "pending",
    },
    {
      id: "demo-confirmed",
      summary: "Pedido de demostración en revisión.",
      status: "confirmed",
      estimatedTime: "25–35 min",
      changes: [],
      fulfillment: "table",
      restaurantStage: "confirmed",
    },
    {
      id: "demo-preparing",
      summary: "Pedido de demostración en preparación.",
      status: "preparing",
      estimatedTime: "20–30 min",
      changes: [],
      fulfillment: "table",
      restaurantStage: "preparing",
    },
    {
      id: "demo-ready",
      summary: "Pedido de demostración listo para recoger.",
      status: "ready",
      changes: [],
      fulfillment: "pickup",
      restaurantStage: "ready",
    },
    {
      id: "demo-190",
      summary: "Pedido de demostración con actualización de tiempo.",
      status: "delayed",
      estimatedTime: "35–45 min",
      delayMessage: "Tu pedido está tardando un poco más de lo esperado.",
      changes: [
        {
          kind: "added",
          description: "Producto agregado · Refresco 500ml — Q15.00",
        },
        {
          kind: "quantity-updated",
          description:
            "Cantidad modificada · Hamburguesa clásica: 1 → 2 unidades",
        },
      ],
      fulfillment: "delivery",
      restaurantStage: "preparing",
      deliveryStage: "pending",
    },
    {
      id: "demo-delivered",
      summary: "Pedido de demostración entregado.",
      status: "delivered",
      changes: [],
      fulfillment: "delivery",
      restaurantStage: "ready",
      deliveryStage: "delivered",
    },
  ];

export function findClientOrderTracking(orderId: string) {
  return clientOrderTrackingFixtures.find((order) => order.id === orderId);
}
