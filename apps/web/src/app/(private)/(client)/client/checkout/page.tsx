import { PickupCheckout } from "@/modules/checkout/components/pickup-checkout";
import { requireContext } from "@/modules/auth/server/auth-session";

export default async function CheckoutPage() {
  const user = await requireContext("client");
  return <PickupCheckout key={user.userId} userId={user.userId} />;
}
