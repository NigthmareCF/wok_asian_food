"use client";

import Link from "next/link";
import {
  CheckCircle2,
  CreditCard,
  Landmark,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import type {
  CheckoutActions,
  CheckoutSnapshot,
  PaymentMethod,
} from "../checkout-snapshot";
import { formatQuetzales, getCheckoutTotalCents } from "../checkout-snapshot";
import styles from "./checkout.module.css";

const paymentMethods: ReadonlyArray<{
  value: PaymentMethod;
  label: string;
  icon: typeof WalletCards;
}> = [
  { value: "cash", label: "Efectivo", icon: WalletCards },
  { value: "card", label: "Tarjeta", icon: CreditCard },
  { value: "transfer", label: "Transferencia", icon: Landmark },
];

const demoServices = [
  { value: "table", label: "Consumo en mesa" },
  { value: "pickup", label: "Para recoger" },
  { value: "delivery", label: "Delivery" },
] as const;

export function CheckoutView({
  snapshot,
  actions,
  isRevalidating = false,
  revalidationMessage,
  isPending = false,
}: {
  snapshot: CheckoutSnapshot;
  actions: CheckoutActions;
  isRevalidating?: boolean;
  revalidationMessage?: string;
  isPending?: boolean;
}) {
  const isTableService = snapshot.service === "table";
  const totalCents = getCheckoutTotalCents(snapshot);
  const serviceLabel =
    snapshot.service === "table"
      ? "Consumo en mesa"
      : snapshot.service === "pickup"
        ? "Para recoger"
        : "Delivery";

  return (
    <section className={styles.checkout} aria-labelledby="checkout-title">
      <header className={styles.header}>
        <div>
          <span className={styles.kicker}>SOLICITUD</span>
          <h1 id="checkout-title">Revisar solicitud</h1>
        </div>
      </header>

      <section
        className={styles.demoControls}
        aria-labelledby="demo-service-title"
      >
        <div>
          <h2 id="demo-service-title">Probar tipos de servicio</h2>
          <p>
            Controles de demostración. El servicio real será proporcionado por
            el carrito.
          </p>
        </div>
        <nav
          aria-label="Tipos de servicio de demostración"
          className={styles.demoLinks}
        >
          {demoServices.map((service) => {
            const isCurrent = service.value === snapshot.service;
            return (
              <Link
                aria-current={isCurrent ? "page" : undefined}
                className={`${styles.demoLink} ${isCurrent ? styles.demoLinkCurrent : ""}`}
                href={`/client/checkout?service=${service.value}`}
                key={service.value}
              >
                {service.label}
              </Link>
            );
          })}
        </nav>
      </section>

      <section className={styles.summary} aria-labelledby="service-title">
        <div className={styles.summaryHeading}>
          <div>
            <strong id="service-title">Tipo de servicio: {serviceLabel}</strong>
          </div>
        </div>
        <ul className={styles.lineList} aria-label="Resumen de artículos">
          {snapshot.lines.map((line) => (
            <li key={line.id}>
              <span>
                {line.quantity} × {line.title}
                {line.detail ? ` · ${line.detail}` : ""}
              </span>
              {!isTableService ? (
                <strong>
                  {formatQuetzales(line.quantity * line.unitPriceCents)}
                </strong>
              ) : null}
            </li>
          ))}
        </ul>
        {!isTableService ? (
          <div className={styles.total}>
            <span>Total</span>
            <strong>{formatQuetzales(totalCents)}</strong>
          </div>
        ) : null}
      </section>

      {!isTableService ? (
        <>
          <fieldset className={styles.card}>
            <legend>MÉTODO DE PAGO</legend>
            <div className={styles.methodGrid}>
              {paymentMethods.map(({ value, label, icon: Icon }) => (
                <button
                  aria-pressed={snapshot.paymentMethod === value}
                  className={
                    snapshot.paymentMethod === value ? styles.selected : ""
                  }
                  key={value}
                  onClick={() => actions.onPaymentMethodChange(value)}
                  type="button"
                >
                  <Icon aria-hidden="true" size={22} />
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        </>
      ) : null}

      <button
        className={styles.revalidate}
        disabled={isRevalidating || isPending}
        onClick={actions.onRevalidate}
        type="button"
      >
        <ReceiptText aria-hidden="true" size={18} />
        {isRevalidating ? "REVALIDANDO..." : "REVALIDAR SOLICITUD"}
      </button>
      {revalidationMessage ? (
        <p className={styles.notice} role="status">
          {revalidationMessage}
        </p>
      ) : null}
      <button
        className="button button--primary button--full"
        disabled={isPending}
        onClick={actions.onConfirm}
        type="button"
      >
        {isTableService ? "ENVIAR SOLICITUD" : "CONFIRMAR SOLICITUD"}
      </button>

      {isPending ? (
        <section className={styles.pending} aria-live="polite">
          <CheckCircle2 aria-hidden="true" size={26} />
          <div>
            <h2>Solicitud pendiente</h2>
            <p>Esta es una demostración; la solicitud permanece pendiente.</p>
            <Link
              className="button button--secondary"
              href={`/client/orders/${snapshot.demoTrackingOrderId}`}
            >
              VER SEGUIMIENTO DE DEMOSTRACIÓN
            </Link>
          </div>
        </section>
      ) : null}
    </section>
  );
}
