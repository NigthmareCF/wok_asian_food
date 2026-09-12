import { DeliveryDetailView } from "@/modules/delivery";
import { DeliverySessionProvider } from "@/modules/delivery";

interface DeliveryDetailPageProps {
  params: Promise<{ orderId: string }>;
}

export default async function DeliveryDetailPage({ params }: DeliveryDetailPageProps) {
  const { orderId } = await params;
  return (
    <DeliverySessionProvider>
      <DeliveryDetailView orderId={orderId} />
    </DeliverySessionProvider>
  );
}