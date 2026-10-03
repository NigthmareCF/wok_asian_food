import { notFound } from "next/navigation";
import { isUuid } from "@/modules/checkout/pickup-contract";
import { ClientDeliveryDetail } from "@/modules/delivery/components/client-delivery-history";
export default async function Page({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  if (!isUuid(requestId)) notFound();
  return <ClientDeliveryDetail key={requestId} requestId={requestId} />;
}
