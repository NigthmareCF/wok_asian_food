import { ProductionListView } from "@/modules/production";
import { ProductionSessionProvider } from "@/modules/production";

export default function ProductionPage() {
  return (
    <ProductionSessionProvider>
      <ProductionListView />
    </ProductionSessionProvider>
  );
}