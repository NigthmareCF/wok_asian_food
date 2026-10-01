import Link from "next/link";
import {
  ArrowLeft,
  Compass,
  MapPin,
  NavigationOff,
  ShieldOff,
} from "lucide-react";
import type { LocationSnapshot as LocationSnapshotData } from "@/data/fixtures/location";
import { Button } from "@/shared/components/ui/button";
import styles from "./location.module.css";

export function LocationSnapshot({
  snapshot,
}: {
  snapshot: LocationSnapshotData;
}) {
  const canOpenNavigation =
    snapshot.navigationProviderState === "available" &&
    Boolean(snapshot.navigationUrl);
  const providerDetails =
    snapshot.navigationProviderState === "available"
      ? snapshot.navigationUrl
        ? {
            description:
              "Hay un enlace de navegación externo disponible para esta consulta demostrativa.",
            title: "Proveedor de navegación disponible",
          }
        : {
            description:
              "El proveedor está disponible, pero la navegación no está configurada.",
            title: "Navegación no configurada",
          }
      : {
          description:
            "La navegación externa se habilitará cuando exista un proveedor y enlace aprobados.",
          title: "Proveedor de navegación pendiente",
        };

  return (
    <section className={styles.location} aria-labelledby="location-title">
      <header className={styles.header}>
        <span className={styles.kicker}>INFORMACIÓN DEL RESTAURANTE</span>
        <h1 id="location-title">Ubicación</h1>
        <p>Consulta demostrativa; no usa mapas ni tu ubicación.</p>
      </header>

      <article className={styles.card}>
        <MapPin aria-hidden="true" className={styles.icon} size={28} />
        <div>
          <h2>Ubicación pendiente de confirmación</h2>
          <p>{snapshot.address ?? "Aún no hay una dirección publicada."}</p>
        </div>
      </article>

      <article className={styles.card}>
        <Compass aria-hidden="true" className={styles.icon} size={28} />
        <div>
          <h2>Horario</h2>
          <p>{snapshot.schedule ?? "Horario pendiente de confirmación."}</p>
        </div>
      </article>

      <article className={styles.card}>
        <NavigationOff aria-hidden="true" className={styles.icon} size={28} />
        <div>
          <h2>{providerDetails.title}</h2>
          <p>{providerDetails.description}</p>
        </div>
      </article>

      {snapshot.permissionState === "denied" ? (
        <aside className={styles.notice} role="status">
          <ShieldOff aria-hidden="true" size={20} />
          <div>
            <strong>Permiso de ubicación denegado</strong>
            <p>No se solicita ni se usa la ubicación del dispositivo.</p>
          </div>
        </aside>
      ) : null}

      {canOpenNavigation ? (
        <a
          className="button button--primary"
          href={snapshot.navigationUrl}
          rel="noreferrer"
          target="_blank"
        >
          CÓMO LLEGAR
        </a>
      ) : (
        <Button aria-describedby="navigation-help" disabled fullWidth>
          CÓMO LLEGAR
        </Button>
      )}
      {!canOpenNavigation ? (
        <p className={styles.help} id="navigation-help">
          {snapshot.navigationProviderState === "available"
            ? "La navegación no está configurada con una navigationUrl aprobada."
            : "La acción estará disponible con una navigationUrl aprobada."}
        </p>
      ) : null}

      <Link className="button button--secondary" href="/">
        <ArrowLeft aria-hidden="true" size={18} />
        Volver al inicio
      </Link>
    </section>
  );
}
