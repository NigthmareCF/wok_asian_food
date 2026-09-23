"use client";

import { Button } from "@/shared/components/ui/button";
import type { CheckoutActions, CheckoutSnapshot } from "../checkout-snapshot";
import { formatQuetzales } from "../checkout-snapshot";
import styles from "./checkout.module.css";

export function CheckoutView({
  snapshot,
  actions,
  isRevalidating = false,
  revalidationMessage,
  confirmationBlocked = true,
}: {
  snapshot: CheckoutSnapshot;
  actions: CheckoutActions;
  isRevalidating?: boolean;
  revalidationMessage?: string;
  confirmationBlocked?: boolean;
}) {
  const isTableService = snapshot.service === "table";
  const serviceLabel = {
    table: "Consumo en mesa",
    pickup: "Para recoger",
    delivery: "Delivery",
  }[snapshot.service];
  return (
    <section className={styles.checkout} aria-labelledby="checkout-title">
      <header className={styles.header}>
        <div>
          <span className={styles.kicker}>SOLICITUD</span>
          <h1 id="checkout-title">Revisar solicitud</h1>
        </div>
      </header>
      <p className={styles.notice}>
        Guardado solamente durante esta sesión. Agregar al carrito no reserva
        existencias. La disponibilidad se verificará antes de confirmar.
      </p>
      <section className={styles.summary} aria-labelledby="service-title">
        <strong id="service-title">Tipo de servicio: {serviceLabel}</strong>
        <ul className={styles.lineList} aria-label="Resumen de artículos">
          {snapshot.lines.map((line) => (
            <li key={line.id}>
              <span>
                {line.quantity} × {line.title}
                {line.detail ? ` · ${line.detail}` : ""}
              </span>
              {!isTableService ? (
                <strong>{formatQuetzales(line.subtotalCents)}</strong>
              ) : null}
            </li>
          ))}
        </ul>
        {!isTableService ? (
          <div className={styles.total}>
            <span>Subtotal de productos</span>
            <strong>{formatQuetzales(snapshot.subtotalCents)}</strong>
          </div>
        ) : null}
      </section>
      {!isTableService ? (
        <p className={styles.notice}>
          Opciones de pago pendientes de confirmación.
        </p>
      ) : null}
      {snapshot.service === "delivery" ? (
        <p className={styles.notice}>
          La tarifa y los datos de entrega están pendientes de confirmación. El
          subtotal incluye solamente productos; el traslado externo se gestiona
          por separado de la preparación.
        </p>
      ) : null}
      <Button
        variant="secondary"
        disabled={isRevalidating}
        onClick={actions.onRevalidate}
      >
        {isRevalidating ? "REVALIDANDO..." : "REVALIDAR SOLICITUD"}
      </Button>
      {revalidationMessage ? (
        <p className={styles.notice} role="status">
          {revalidationMessage}
        </p>
      ) : null}
      <p className={styles.notice} id="checkout-confirm-help">
        La creación de solicitudes todavía no está disponible. Tus artículos
        siguen en el carrito; no se ha enviado un pedido.
      </p>
      <Button
        fullWidth
        disabled={confirmationBlocked || isRevalidating}
        onClick={actions.onConfirm}
        aria-describedby="checkout-confirm-help"
      >
        {isTableService ? "ENVIAR SOLICITUD" : "CONFIRMAR SOLICITUD"}
      </Button>
    </section>
  );
}
