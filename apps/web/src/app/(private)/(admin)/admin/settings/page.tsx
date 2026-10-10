import {PolicySettings} from "@/modules/consolidated-core/policy-settings";
import {requireContext} from "@/modules/auth/server/auth-session";
import { RestaurantSettingsView } from "@/modules/settings";
export default async function Page() {
  const user=await requireContext("admin");
  return <><PolicySettings userId={user.userId}/><RestaurantSettingsView/></>;
}
