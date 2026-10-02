import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CartLink } from "@/modules/cart/components/cart-link";
import { MenuCatalog } from "@/modules/menu";
import { menuFixtures } from "@/data/fixtures/menu";
import { landingPathForRoles } from "@/modules/auth/auth-policy";
import { currentSession } from "@/modules/auth/server/auth-session";
import { PublicHeader } from "@/shared/components/public-header";
import styles from "@/modules/menu/components/menu-catalog.module.css";

export default async function MenuPage() {
  const user = await currentSession();
  const accountHref = user ? landingPathForRoles(user.roles) : undefined;
  return (
    <div className={`public-page ${styles.page}`}>
      <PublicHeader accountHref={accountHref} />
      <main className={styles.content}>
        <header className={styles.heading}>
          <div>
            <span className="eyebrow">WOK ASIAN FOOD</span>
            <h1>Menú</h1>
            <p>Del sushi al wok. Encuentra algo para cada antojo.</p>
          </div>
          {accountHref ? (
            <Link className="button button--secondary" href={accountHref}>
              <ArrowLeft aria-hidden="true" size={18} />
              Volver a mi espacio
            </Link>
          ) : null}
        </header>
        <CartLink />
        <MenuCatalog products={menuFixtures} />
      </main>
    </div>
  );
}
