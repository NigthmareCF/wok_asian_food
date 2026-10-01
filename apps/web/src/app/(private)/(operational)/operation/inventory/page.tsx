import { InventoryListView } from "@/modules/inventory";
import { InventorySessionProvider } from "@/modules/inventory";

export default function InventoryPage() {
  return (
    <InventorySessionProvider>
      <InventoryListView />
    </InventorySessionProvider>
  );
}