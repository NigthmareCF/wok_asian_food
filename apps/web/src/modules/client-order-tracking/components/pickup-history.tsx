"use client";
import Link from "next/link";
import { Button } from "@/shared/components/ui/button";
import {
  formatPickupMoney,
  isPickupHistory,
  pickupStatusLabels,
} from "../pickup-details";
import { usePickupResource } from "../use-pickup-resource";
import styles from "./client-order-list.module.css";

export function PickupHistory() {
  const { data, error, reload } = usePickupResource(
    "/bff/order-requests",
    isPickupHistory,
  );
  return (
    <div className={styles.orders}>
      <header className={styles.header}>
        <h1>Solicitudes para recoger</h1>
        <p>
          Consulta tus últimas 50 solicitudes. Una solicitud pendiente todavía
          requiere aceptación del restaurante.
        </p>
      </header>
      <Link href="/menu">Volver al menú</Link>
      <Button variant="secondary" onClick={reload}>
        Actualizar solicitudes
      </Button>
      {error ? (
        <section role="alert">
          <p>{error.message}</p>
          {error.status === 401 ? (
            <Link href="/login?next=%2Fclient%2Forders">Iniciar sesión</Link>
          ) : (
            <Button onClick={reload}>Reintentar</Button>
          )}
        </section>
      ) : !data ? (
        <p role="status">Cargando solicitudes…</p>
      ) : data.length === 0 ? (
        <section className={styles.empty}>
          <h2>Aún no tienes solicitudes para recoger</h2>
          <Link href="/menu">Explorar el menú</Link>
        </section>
      ) : (
        <section className={styles.list} aria-label="Tus solicitudes">
          {data.map((request) => (
            <Link
              className={styles.order}
              key={request.requestId}
              href={`/client/orders/${request.requestId}`}
            >
              <strong>Solicitud {request.requestId}</strong>
              <span>{pickupStatusLabels[request.status]}</span>
              <p>
                Para recoger:{" "}
                {new Date(request.requestedFor).toLocaleString("es-GT")}
              </p>
              <p>{formatPickupMoney(request.subtotal, request.currency)}</p>
              <small>Ver detalle</small>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
