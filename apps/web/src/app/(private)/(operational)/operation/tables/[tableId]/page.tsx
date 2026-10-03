import { OperationalTableDetailView } from "@/modules/tables/components/operational-table-detail-view";

export default async function TableDetailPage({
  params,
}: {
  params: Promise<{ tableId: string }>;
}) {
  const { tableId } = await params;

  return <OperationalTableDetailView tableId={tableId} />;
}
