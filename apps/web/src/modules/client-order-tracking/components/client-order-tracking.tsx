"use client";

import { useClientSession } from "@/modules/clients/client-session-provider";
import { OrderTrackingView } from "./order-tracking-view";

export function ClientOrderTracking({ orderId }: { orderId: string }) {
  const { orders } = useClientSession();
  return (
    <OrderTrackingView order={orders.find((order) => order.id === orderId)} />
  );
}
