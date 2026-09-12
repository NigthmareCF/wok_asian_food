import { ClientMessagingView } from "@/modules/messaging";
import { ClientDemoNavigation } from "@/modules/client-demo-navigation";

export default function ClientMessagesPage() {
  return (
    <>
      <ClientDemoNavigation />
      <ClientMessagingView />
    </>
  );
}
