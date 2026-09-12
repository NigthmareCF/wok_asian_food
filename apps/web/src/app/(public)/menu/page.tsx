import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CartLink } from "@/modules/cart/components/cart-link";
import { MenuCatalog } from "@/modules/menu";
import { menuFixtures } from "@/data/fixtures/menu";
import { PublicHeader } from "@/shared/components/public-header";
import styles from "@/modules/menu/components/menu-catalog.module.css";

export default function MenuPage() {
  return (
    <div className={`public-page ${styles.page}`}>
      <PublicHeader />
      <main className={styles.content}>
        <header className={styles.heading}>
          <div>
            <span className="eyebrow">WOK ASIAN FOOD</span>
            <h1>Menú</h1>
            <p>Del sushi al wok. Encuentra algo para cada antojo.</p>
          </div>
          <Link className="button button--secondary" href="/client">
            <ArrowLeft aria-hidden="true" size={18} />
            Inicio de cliente
          </Link>
        </header>
        <CartLink />
        <MenuCatalog products={menuFixtures} />
      </main>
    </div>
  );
}
