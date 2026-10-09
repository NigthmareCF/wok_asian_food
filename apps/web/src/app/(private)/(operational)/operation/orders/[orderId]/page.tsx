import { OperationalOrderDetailView } from "@/modules/orders";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <OperationalOrderDetailView orderId={orderId} />;
}
