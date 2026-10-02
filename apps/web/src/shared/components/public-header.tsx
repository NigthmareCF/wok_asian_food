import Link from "next/link";
import { Home, LogIn, UserRound } from "lucide-react";

export function PublicHeader({ accountHref }: { accountHref?: string }) {
  return (
    <header className="public-header">
      <Link className="brand" href="/" aria-label="WOK Asian Food, inicio">
        <span>WOK</span> ASIAN FOOD
      </Link>
      <nav aria-label="Navegacion publica">
        <Link className="public-header__home-link" href="/">
          <Home aria-hidden="true" size={18} />
          <span className="public-header__home-label">Inicio</span>
        </Link>
        <Link className="public-header__section-link" href="/menu">
          Menu
        </Link>
        <Link className="public-header__section-link" href="/location">
          Ubicacion
        </Link>
        <Link
          aria-label={accountHref ? "Mi espacio" : "Ingresar"}
          className="button button--primary button--compact"
          href={accountHref ?? "/login"}
          title={accountHref ? "Mi espacio" : "Ingresar"}
        >
          {accountHref ? (
            <UserRound aria-hidden="true" size={18} />
          ) : (
            <LogIn aria-hidden="true" size={18} />
          )}
          <span className="public-header__login-label">
            {accountHref ? "Mi espacio" : "Ingresar"}
          </span>
        </Link>
      </nav>
    </header>
  );
}
