import { RestaurantSettingsView } from "@/modules/settings";
import { ServiceCapabilitiesView } from "@/modules/service-capabilities";
export default function Page() {
  return (
    <>
      <RestaurantSettingsView />
      <ServiceCapabilitiesView />
    </>
  );
}
