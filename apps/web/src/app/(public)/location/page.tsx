import { PublicHeader } from "@/shared/components/public-header";
import { locationFixture } from "@/data/fixtures/location";
import { LocationSnapshot } from "@/modules/location";

export default function LocationPage() {
  return (
    <main className="public-page">
      <PublicHeader />
      <div className="public-page__content">
        <LocationSnapshot snapshot={locationFixture} />
      </div>
    </main>
  );
}
