import { PreBillView } from "@/modules/payments";

interface PreBillPageProps {
  params: Promise<{ recordId: string }>;
}

export default async function PreBillPage({ params }: PreBillPageProps) {
  const { recordId } = await params;
  return <PreBillView recordId={recordId} />;
}
