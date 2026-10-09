import { PickupRequestDetail } from "@/modules/client-order-tracking/components/pickup-request-detail";
import { isUuid } from "@/modules/checkout/pickup-contract";
import { notFound } from "next/navigation";
import { requireContext } from "@/modules/auth/server/auth-session";

export default async function ClientOrderTrackingPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  if (!isUuid(orderId)) notFound();
  const user = await requireContext("client");
  return (
    <PickupRequestDetail
      key={orderId}
      requestId={orderId}
      userId={user.userId}
    />
  );
}
