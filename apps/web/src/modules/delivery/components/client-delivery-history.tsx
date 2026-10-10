"use client";
import { formatServiceDateTime } from "@/modules/checkout/service-time";
import Link from "next/link";
import { useClientPickupResource } from "@/modules/client-order-tracking/use-client-pickup-resource";
import {
  pickupStatusLabels,
  formatPickupMoney,
  pickupOrderStatusLabels,
  requestStatusDescriptions,
} from "@/modules/client-order-tracking/pickup-details";
import { isDeliveryHistory, isDeliveryDetails } from "../client-contract";
import { Button } from "@/shared/components/ui/button";
import styles from "@/modules/checkout/components/checkout.module.css";
import { RequestCancellation } from "@/modules/client-order-tracking/components/request-cancellation";
const deliveryOrderStatusLabels: Record<string, string> = {
  ...pickupOrderStatusLabels,
  READY: "Listo en cocina",
};
export function ClientDeliveryHistory({ userId }: { userId?: string }) {
  const { data, error, reload } = useClientPickupResource(
    "/bff/delivery-requests",
    isDeliveryHistory,
    userId,
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
            {item.orderStatus && (
              <p>
                Estado del pedido: {deliveryOrderStatusLabels[item.orderStatus]}
              </p>
            )}
            <p>{formatServiceDateTime(item.requestedFor)}</p>
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
export function ClientDeliveryDetail({
  requestId,
  userId,
}: {
  requestId: string;
  userId?: string;
}) {
  const { data, error, reload } = useClientPickupResource(
    `/bff/delivery-requests/${requestId}`,
    isDeliveryDetails,
    userId,
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
          {data.orderStatus && (
            <p>
              Estado del pedido: {deliveryOrderStatusLabels[data.orderStatus]}
            </p>
          )}
          <p>Código: {data.requestId}</p>
          <p>{formatServiceDateTime(data.requestedFor)}</p>
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
          <p>{requestStatusDescriptions[data.status]}</p>
          <p>
            El seguimiento corresponde a la preparación del pedido. El reparto y
            la cancelación de un delivery aceptado requieren coordinación
            directa con el restaurante.
          </p>
          <Link href="/client/messages">Contactar al restaurante</Link>
          {data.status === "PENDING_REVIEW" && (
            <RequestCancellation
              requestId={requestId}
              userId={userId}
              onChanged={reload}
            />
          )}
        </section>
      )}
    </div>
  );
}
