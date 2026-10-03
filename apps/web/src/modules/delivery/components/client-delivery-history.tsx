"use client";
import Link from "next/link";
import { usePickupResource } from "@/modules/client-order-tracking/use-pickup-resource";
import {
  pickupStatusLabels,
  formatPickupMoney,
} from "@/modules/client-order-tracking/pickup-details";
import { isDeliveryHistory, isDeliveryDetails } from "../client-contract";
import { Button } from "@/shared/components/ui/button";
import styles from "@/modules/checkout/components/checkout.module.css";
export function ClientDeliveryHistory() {
  const { data, error, reload } = usePickupResource(
    "/bff/delivery-requests",
    isDeliveryHistory,
  );
  return (
    <div className={styles.checkout}>
      <h1>Mis solicitudes de delivery</h1>
      <Link href="/client/delivery">Solicitar delivery</Link>
      <Button onClick={reload}>Actualizar solicitudes</Button>
      {error ? (
        <p role="alert">
          {error.message}{" "}
          <Link href="/login?next=%2Fclient%2Fdelivery%2Fhistory">
            Iniciar sesión
          </Link>
        </p>
      ) : !data ? (
        <p role="status">Consultando solicitudes…</p>
      ) : data.length === 0 ? (
        <p>No tienes solicitudes de delivery.</p>
      ) : (
        data.map((item) => (
          <article className={styles.summary} key={item.requestId}>
            <h2>{pickupStatusLabels[item.status]}</h2>
            <p>{new Date(item.requestedFor).toLocaleString("es-GT")}</p>
            <p>{formatPickupMoney(item.subtotal, item.currency)}</p>
            <Link href={`/client/delivery/${item.requestId}`}>
              Ver solicitud {item.requestId}
            </Link>
          </article>
        ))
      )}
    </div>
  );
}
export function ClientDeliveryDetail({ requestId }: { requestId: string }) {
  const { data, error, reload } = usePickupResource(
    `/bff/delivery-requests/${requestId}`,
    isDeliveryDetails,
  );
  return (
    <div className={styles.checkout}>
      <h1>Detalle de delivery</h1>
      <Link href="/client/delivery/history">Volver a mis solicitudes</Link>
      <Button onClick={reload}>Actualizar estado</Button>
      {error ? (
        <p role="alert">{error.message}</p>
      ) : !data ? (
        <p role="status">Consultando solicitud…</p>
      ) : (
        <section className={styles.summary}>
          <h2>{pickupStatusLabels[data.status]}</h2>
          <p>Código: {data.requestId}</p>
          <p>{new Date(data.requestedFor).toLocaleString("es-GT")}</p>
          {data.items.map((line, index) => (
            <p key={index}>
              {line.quantity} × {line.name}:{" "}
              {formatPickupMoney(line.lineTotal, data.currency)}
            </p>
          ))}
          <p>Subtotal: {formatPickupMoney(data.subtotal, data.currency)}</p>
          <p>
            Preferencia:{" "}
            {data.paymentPreference === "CASH_ON_DELIVERY"
              ? "Efectivo al recibir"
              : "Pago en línea solicitado; pendiente de coordinación"}
          </p>
          {data.customerNote && <p>Nota: {data.customerNote}</p>}
          <p>
            La solicitud requiere revisión de cobertura, disponibilidad y
            horario. No registra un pago. Para solicitar cambios o cancelación,
            contacta al restaurante.
          </p>
          <Link href="/client/messages">Contactar al restaurante</Link>
        </section>
      )}
    </div>
  );
}
