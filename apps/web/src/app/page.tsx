import Link from "next/link";
import { ArrowRight, MapPin, UtensilsCrossed } from "lucide-react";
import { PublicHeader } from "@/shared/components/public-header";

export default function HomePage() {
  return (
    <main className="public-home">
      <PublicHeader />
      <section className="public-home__content">
        <span className="eyebrow">SABOR ASIATICO</span>
        <h1>WOK Asian Food</h1>
        <p>
          Consulta el menu disponible y gestiona tus pedidos desde cualquier
          dispositivo.
        </p>
        <div className="action-row">
          <Link className="button button--primary" href="/menu">
            <UtensilsCrossed size={19} aria-hidden="true" />
            Ver menu
          </Link>
          <Link className="button button--secondary" href="/location">
            <MapPin size={19} aria-hidden="true" />
            Ubicacion
          </Link>
        </div>
      </section>
      <Link className="next-section-link" href="/client">
        Ir al espacio de cliente <ArrowRight size={18} aria-hidden="true" />
      </Link>
    </main>
  );
}
