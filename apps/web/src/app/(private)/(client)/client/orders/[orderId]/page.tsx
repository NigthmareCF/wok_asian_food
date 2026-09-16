import { findClientOrderTracking } from "@/data/fixtures/client-order-tracking";
import { OrderTrackingView } from "@/modules/client-order-tracking";

export default async function ClientOrderTrackingPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <OrderTrackingView order={findClientOrderTracking(orderId)} />;
}
