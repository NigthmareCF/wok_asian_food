import { ClientDemoNavigation } from "@/modules/client-demo-navigation";
import { ClientOrderListView } from "@/modules/client-order-tracking";

export default function ClientOrdersPage() {
  return (
    <>
      <ClientDemoNavigation />
      <ClientOrderListView />
    </>
  );
}
