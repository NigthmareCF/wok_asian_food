"use client";
import Link from "next/link";
import { Button } from "@/shared/components/ui/button";
import {
  formatPickupMoney,
  isPickupHistory,
  pickupOrderStatusLabels,
  pickupStatusLabels,
} from "../pickup-details";
import { useClientPickupResource } from "../use-client-pickup-resource";
import styles from "./client-order-list.module.css";

export function PickupHistory({ userId }: { userId?: string } = {}) {
  const { data, error, reload } = useClientPickupResource(
    "/bff/order-requests",
    isPickupHistory,
    userId,
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
      <Link href="/client/menu">Volver al menú</Link>
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
          <Link href="/client/menu">Explorar el menú</Link>
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
              {request.orderStatus && (
                <p>
                  Estado del pedido:{" "}
                  {pickupOrderStatusLabels[request.orderStatus]}
                </p>
              )}
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
