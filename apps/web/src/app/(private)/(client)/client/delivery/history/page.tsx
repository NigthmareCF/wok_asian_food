import { ClientDeliveryHistory } from "@/modules/delivery/components/client-delivery-history";
import { requireContext } from "@/modules/auth/server/auth-session";
export default async function Page() {
  const user = await requireContext("client");
  return <ClientDeliveryHistory userId={user.userId} />;
}
