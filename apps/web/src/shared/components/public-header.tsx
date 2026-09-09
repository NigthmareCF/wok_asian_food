import Link from "next/link";
import { Home, LogIn } from "lucide-react";

export function PublicHeader() {
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
          aria-label="Ingresar"
          className="button button--primary button--compact"
          href="/login"
          title="Ingresar"
        >
          <LogIn aria-hidden="true" size={18} />
          <span className="public-header__login-label">Ingresar</span>
        </Link>
      </nav>
    </header>
  );
}
