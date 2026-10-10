import {ClientCore} from "@/modules/consolidated-core/client-core";
import { PickupHistory } from "@/modules/client-order-tracking/components/pickup-history";
import { requireContext } from "@/modules/auth/server/auth-session";

export default async function ClientOrdersPage() {
  const user = await requireContext("client");
  return <><PickupHistory userId={user.userId}/><ClientCore userId={user.userId}/></>;
}
