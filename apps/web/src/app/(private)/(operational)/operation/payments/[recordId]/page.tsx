import { PaymentDetailView } from "@/modules/payments";
import { PaymentsSessionProvider } from "@/modules/payments";

interface PaymentDetailPageProps {
  params: Promise<{ recordId: string }>;
}

export default async function PaymentDetailPage({ params }: PaymentDetailPageProps) {
  const { recordId } = await params;
  return (
    <PaymentsSessionProvider>
      <PaymentDetailView recordId={recordId} />
    </PaymentsSessionProvider>
  );
}