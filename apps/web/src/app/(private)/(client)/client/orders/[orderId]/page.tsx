import { ClientOrderTracking } from "@/modules/client-order-tracking/components/client-order-tracking";

export default async function ClientOrderTrackingPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <ClientOrderTracking orderId={orderId} />;
}
