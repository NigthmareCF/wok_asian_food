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
  PaymentTiming,
  TipOption,
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
  const totalCents = getCheckoutTotalCents(snapshot);
  const serviceLabel =
    snapshot.service === "table"
      ? "Mesa"
      : snapshot.service === "pickup"
        ? "Para recoger"
        : "Delivery";

  return (
    <section className={styles.checkout} aria-labelledby="checkout-title">
      <header className={styles.header}>
        <div>
          <span className={styles.kicker}>PAGO</span>
          <h1 id="checkout-title">Forma de pago</h1>
        </div>
      </header>

      <section className={styles.summary} aria-labelledby="service-title">
        <div className={styles.summaryHeading}>
          <div>
            <span id="service-title">TIPO DE SERVICIO</span>
            <strong>{serviceLabel}</strong>
          </div>
          <span className={styles.confirmed}>Confirmado</span>
        </div>
        <ul className={styles.lineList} aria-label="Resumen de artículos">
          {snapshot.lines.map((line) => (
            <li key={line.id}>
              <span>
                {line.quantity} × {line.title}
                {line.detail ? ` · ${line.detail}` : ""}
              </span>
              <strong>
                {formatQuetzales(line.quantity * line.unitPriceCents)}
              </strong>
            </li>
          ))}
        </ul>
        <div className={styles.total}>
          <span>Total</span>
          <strong>{formatQuetzales(totalCents)}</strong>
        </div>
      </section>

      <fieldset className={styles.card}>
        <legend>¿CUÁNDO PAGAR?</legend>
        <PaymentTimingOption
          value="now"
          label="Pagar ahora"
          description="Solicitud de pago simulada"
          selected={snapshot.paymentTiming}
          onChange={actions.onPaymentTimingChange}
        />
        {snapshot.canPayAtTable ? (
          <PaymentTimingOption
            value="at-table"
            label="Pagar en mesa"
            description="Pagas al finalizar tu visita"
            selected={snapshot.paymentTiming}
            onChange={actions.onPaymentTimingChange}
          />
        ) : null}
      </fieldset>

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

      {snapshot.service === "table" ? (
        <fieldset className={styles.card}>
          <legend>
            PROPINA SUGERIDA <small>Solo consumo en mesa</small>
          </legend>
          <div className={styles.tipGrid}>
            {([5, 10, 15, 0] as const).map((tip) => (
              <button
                aria-pressed={snapshot.tipPercentage === tip}
                className={
                  snapshot.tipPercentage === tip ? styles.selected : ""
                }
                key={tip}
                onClick={() => actions.onTipChange(tip)}
                type="button"
              >
                {tip === 0 ? "Sin" : `${tip}%`}
              </button>
            ))}
          </div>
        </fieldset>
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
        CONFIRMAR PAGO
      </button>

      {isPending ? (
        <section className={styles.pending} aria-live="polite">
          <CheckCircle2 aria-hidden="true" size={26} />
          <div>
            <h2>Solicitud pendiente simulada</h2>
            <p>
              Esta demostración no procesó el pago, no envió la solicitud al
              restaurante y no confirmó un pedido.
            </p>
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

function PaymentTimingOption({
  value,
  label,
  description,
  selected,
  onChange,
}: {
  value: PaymentTiming;
  label: string;
  description: string;
  selected: PaymentTiming;
  onChange: (value: PaymentTiming) => void;
}) {
  return (
    <button
      aria-pressed={selected === value}
      className={selected === value ? styles.selected : ""}
      onClick={() => onChange(value)}
      type="button"
    >
      <span className={styles.radio} aria-hidden="true" />
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
    </button>
  );
}
