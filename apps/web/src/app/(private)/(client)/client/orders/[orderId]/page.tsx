import { findClientOrderTracking } from "@/data/fixtures/client-order-tracking";
import { OrderTrackingView } from "@/modules/client-order-tracking";
import { ClientDemoNavigation } from "@/modules/client-demo-navigation";

export default async function ClientOrderTrackingPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return (
    <>
      <ClientDemoNavigation />
      <OrderTrackingView order={findClientOrderTracking(orderId)} />
    </>
  );
}
