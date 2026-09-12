import { PublicHeader } from "@/shared/components/public-header";
import { locationFixture } from "@/data/fixtures/location";
import { LocationSnapshot } from "@/modules/location";
import { ClientDemoNavigation } from "@/modules/client-demo-navigation";

export default function LocationPage() {
  return (
    <main className="public-page">
      <PublicHeader />
      <div className="public-page__content">
        <ClientDemoNavigation />
        <LocationSnapshot snapshot={locationFixture} />
      </div>
    </main>
  );
}
