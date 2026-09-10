import { notFound } from "next/navigation";
import { operationalTables, tableOrderItems } from "@/data/fixtures/operation";
import { JoinedTableDetailView, TableDetailView } from "@/modules/tables";

export default async function TableDetailPage({
  params,
}: {
  params: Promise<{ tableId: string }>;
}) {
  const { tableId } = await params;

  if (tableId.startsWith("joined-")) {
    return <JoinedTableDetailView groupId={tableId} />;
  }

  const table = operationalTables.find((item) => item.id === tableId);

  if (!table) notFound();

  return (
    <TableDetailView
      initialTable={table}
      items={tableOrderItems[table.id] ?? []}
    />
  );
}
