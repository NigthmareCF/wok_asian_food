import { InventoryDetailView } from "@/modules/inventory";
import { InventorySessionProvider } from "@/modules/inventory";

interface InventoryDetailPageProps {
  params: Promise<{ itemId: string }>;
}

export default async function InventoryDetailPage({
  params,
}: InventoryDetailPageProps) {
  const { itemId } = await params;
  return (
    <InventorySessionProvider>
      <InventoryDetailView itemId={itemId} />
    </InventorySessionProvider>
  );
}