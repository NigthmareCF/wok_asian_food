import { PaymentDetailView } from "@/modules/payments";

interface PaymentDetailPageProps {
  params: Promise<{ recordId: string }>;
}

export default async function PaymentDetailPage({
  params,
}: PaymentDetailPageProps) {
  const { recordId } = await params;
  return <PaymentDetailView recordId={recordId} />;
}
