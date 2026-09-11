import type { ClientOrderTrackingSnapshot } from "@/modules/client-order-tracking/order-tracking";

/** Fixtures temporales de C-10, exclusivos del seguimiento visible para Cliente. */
export const clientOrderTrackingFixtures: readonly ClientOrderTrackingSnapshot[] =
  [
    {
      id: "demo-pending",
      status: "pending",
      changes: [],
      fulfillment: "pickup",
      restaurantStage: "pending",
    },
    {
      id: "demo-confirmed",
      status: "confirmed",
      estimatedTime: "25–35 min",
      changes: [],
      fulfillment: "table",
      restaurantStage: "confirmed",
    },
    {
      id: "demo-preparing",
      status: "preparing",
      estimatedTime: "20–30 min",
      changes: [],
      fulfillment: "table",
      restaurantStage: "preparing",
    },
    {
      id: "demo-ready",
      status: "ready",
      changes: [],
      fulfillment: "pickup",
      restaurantStage: "ready",
    },
    {
      id: "demo-190",
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
