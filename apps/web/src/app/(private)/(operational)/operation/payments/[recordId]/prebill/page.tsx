import { PreBillView } from "@/modules/payments";
import { PaymentsSessionProvider } from "@/modules/payments";

interface PreBillPageProps {
  params: Promise<{ recordId: string }>;
}

export default async function PreBillPage({ params }: PreBillPageProps) {
  const { recordId } = await params;
  return (
    <PaymentsSessionProvider>
      <PreBillView recordId={recordId} />
    </PaymentsSessionProvider>
  );
}