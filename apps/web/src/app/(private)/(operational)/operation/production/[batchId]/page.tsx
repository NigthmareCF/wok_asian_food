import { ProductionBatchView } from "@/modules/production";
import { ProductionSessionProvider } from "@/modules/production";

interface ProductionBatchPageProps {
  params: Promise<{ batchId: string }>;
}

export default async function ProductionBatchPage({
  params,
}: ProductionBatchPageProps) {
  const { batchId } = await params;
  return (
    <ProductionSessionProvider>
      <ProductionBatchView batchId={batchId} />
    </ProductionSessionProvider>
  );
}