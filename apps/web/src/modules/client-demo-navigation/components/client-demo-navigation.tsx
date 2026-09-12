"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import styles from "./client-demo-navigation.module.css";

const demoViews = [
  {
    href: "/client/reservations/new",
    id: "reservation",
    label: "C-07 Reservación",
  },
  {
    href: "/client/reservations/new?demo=late",
    id: "late-reservation",
    label: "C-08 Reserva tardía",
  },
  { href: "/client/checkout", id: "checkout", label: "C-09 Checkout" },
  { href: "/client/orders/demo-190", id: "order", label: "C-10 Seguimiento" },
  { href: "/location", id: "location", label: "C-11 Ubicación" },
  { href: "/client/messages", id: "messages", label: "C-12 Mensajes" },
] as const;

function getActiveDemoView(pathname: string, demo: string | null) {
  if (pathname === "/client/reservations/new") {
    return demo === "late" ? "late-reservation" : "reservation";
  }
  if (pathname.startsWith("/client/orders/")) return "order";
  return demoViews.find((view) => view.href === pathname)?.id;
}

export function ClientDemoNavigation() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeView = getActiveDemoView(pathname, searchParams.get("demo"));

  return (
    <section className={styles.navigation} aria-labelledby="demo-views-title">
      <div>
        <h2 id="demo-views-title">Vistas de demostración</h2>
        <p>
          Accesos para revisión. No forman parte del flujo real del cliente.
        </p>
      </div>
      <nav
        aria-label="Vistas de demostración de Cliente"
        className={styles.links}
      >
        {demoViews.map((view) => {
          const isCurrent = view.id === activeView;
          return (
            <Link
              aria-label={view.label}
              aria-current={isCurrent ? "page" : undefined}
              className={`${styles.link} ${isCurrent ? styles.current : ""}`}
              href={view.href}
              key={view.id}
            >
              {view.label}
              {isCurrent ? (
                <span className={styles.currentLabel}>Actual</span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </section>
  );
}
