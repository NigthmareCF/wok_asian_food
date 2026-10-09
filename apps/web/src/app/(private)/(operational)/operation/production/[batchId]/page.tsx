import { LiveProductionDetailView } from '@/modules/production';

interface ProductionBatchPageProps {
  params: Promise<{ batchId: string }>;
}

export default async function ProductionBatchPage({ params }: ProductionBatchPageProps) {
  const { batchId } = await params;
  return <LiveProductionDetailView batchId={batchId} />;
}
