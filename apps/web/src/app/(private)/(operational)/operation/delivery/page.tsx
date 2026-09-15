import { DeliveryListView } from "@/modules/delivery";
import { DeliverySessionProvider } from "@/modules/delivery";

export default function DeliveryPage() {
  return (
    <DeliverySessionProvider>
      <DeliveryListView />
    </DeliverySessionProvider>
  );
}