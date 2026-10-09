import { OperationalAccountView } from "@/modules/payments/components/operational-account-view";

interface PaymentDetailPageProps {
  params: Promise<{ recordId: string }>;
}

export default async function PaymentDetailPage({
  params,
}: PaymentDetailPageProps) {
  const { recordId } = await params;
  return <OperationalAccountView accountId={recordId} />;
}
