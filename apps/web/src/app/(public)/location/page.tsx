import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";
import { PublicHeader } from "@/shared/components/public-header";

export default function LocationPage() {
  return (
    <main className="public-page">
      <PublicHeader />
      <section className="public-page__content public-page__content--centered">
        <MapPin aria-hidden="true" size={34} />
        <h1>Ubicacion</h1>
        <p>
          La direccion y el proveedor de mapas estan pendientes de confirmacion.
        </p>
        <Link className="button button--secondary" href="/">
          <ArrowLeft aria-hidden="true" size={18} />
          Volver al inicio
        </Link>
      </section>
    </main>
  );
}
