import { AuthenticatedPublicHeader } from "@/modules/auth/components/authenticated-public-header";
import { locationFixture } from "@/data/fixtures/location";
import { LocationSnapshot } from "@/modules/location";

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
