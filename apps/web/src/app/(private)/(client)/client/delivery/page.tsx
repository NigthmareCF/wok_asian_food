import { requireContext } from "@/modules/auth/server/auth-session";
import { DeliveryCheckout } from "@/modules/delivery/components/delivery-checkout";
export default async function Page() {
  const user = await requireContext("client");
  return <DeliveryCheckout key={user.userId} userId={user.userId} />;
}
