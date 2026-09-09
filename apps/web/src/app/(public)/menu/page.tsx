import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { MenuCatalog } from "@/modules/menu";
import { PublicHeader } from "@/shared/components/public-header";

export default function MenuPage() {
  return (
    <main className="public-page">
      <PublicHeader />
      <section className="public-page__content">
        <header className="page-header">
          <div>
            <span className="eyebrow">CLIENTE</span>
            <h1>Menu</h1>
            <p>Disponibilidad de referencia para construir la experiencia.</p>
          </div>
          <Link className="button button--secondary" href="/client">
            <ShoppingBag aria-hidden="true" size={18} />
            Mi espacio
          </Link>
        </header>
        <MenuCatalog />
      </section>
    </main>
  );
}
