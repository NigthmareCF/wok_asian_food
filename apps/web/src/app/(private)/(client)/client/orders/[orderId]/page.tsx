import { PickupRequestDetail } from "@/modules/client-order-tracking/components/pickup-request-detail";
import { isUuid } from "@/modules/checkout/pickup-contract";
import { notFound } from "next/navigation";

export default async function ClientOrderTrackingPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  if (!isUuid(orderId)) notFound();
  return <PickupRequestDetail key={orderId} requestId={orderId} />;
}
