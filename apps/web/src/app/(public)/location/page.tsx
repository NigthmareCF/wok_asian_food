import { AuthenticatedPublicHeader } from "@/modules/auth/components/authenticated-public-header";
import { LocationSnapshot } from "@/modules/location/components/location-snapshot";
import { locationFixture } from "@/data/fixtures/location";
export default function LocationPage() {
  return (
    <main className="public-page">
      <AuthenticatedPublicHeader />
      <div className="public-page__content">
        <LocationSnapshot snapshot={locationFixture} />
      </div>
    </main>
  );
}
