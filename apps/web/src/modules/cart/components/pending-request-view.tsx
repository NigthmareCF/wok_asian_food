"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowLeft, Bell, Clock3, TriangleAlert, WifiOff } from "lucide-react";
import { pendingRequestMessages } from "@/data/fixtures/pending-request";
import { cartServiceOptions } from "@/data/fixtures/cart";
import { Button } from "@/shared/components/ui/button";
import { StatusBadge } from "@/shared/components/ui/status-badge";
import { formatMenuPrice } from "@/modules/menu/lib/product-presentation";
import { useCart } from "../cart-provider";
import { getCartSubtotal, type CartRow } from "../lib/cart";
import type { PendingRequest } from "../use-pending-request";
import styles from "./pending-request.module.css";

export function PendingRequestView({
  request,
  rows,
  onReturn,
  onCancel,
}: {
  request: PendingRequest;
  rows: readonly CartRow[];
  onReturn: () => void;
  onCancel: () => void;
}) {
  const { service, waitForPendingRequest, requestPendingNotice } = useCart();
  const heading = useRef<HTMLHeadingElement>(null);
  const content = pendingRequestMessages[request.status];
  const Icon = request.status === "offline" ? WifiOff : TriangleAlert;
  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <div className={styles.pending}>
      <div className={styles.navigation}>
        <Button variant="secondary" type="button" onClick={onReturn}>
          <ArrowLeft aria-hidden="true" size={18} />
          Volver al carrito
        </Button>
        <Link href="/menu">Ver menú</Link>
      </div>
      <div className={styles.layout}>
        <section className={styles.message} aria-labelledby="pending-title">
          <span className={styles.icon}>
            <Icon aria-hidden="true" size={30} />
          </span>
          <h1 id="pending-title" ref={heading} tabIndex={-1}>
            Aún no podemos confirmar tu pedido.
          </h1>
          <div className={styles.status} role="status" aria-atomic="true">
            <StatusBadge
              label={request.waiting ? "Comprobando de nuevo" : content.label}
              tone="warning"
            />
            <p>
              {request.waiting
                ? request.status === "reconnecting"
                  ? pendingRequestMessages.reconnecting.message
                  : "Conservamos tu selección mientras hacemos una nueva revisión local. Tu solicitud aún no está confirmada."
                : content.message}
            </p>
          </div>
          <p className={styles.demo} id="pending-demo">
            Experiencia demostrativa. La espera es local; no se envían
            solicitudes al restaurante ni se reserva disponibilidad. Al recargar
            se vacía esta sesión.
          </p>
          <div className={styles.actions}>
            <Button
              type="button"
              onClick={waitForPendingRequest}
              disabled={request.waiting}
              aria-describedby="pending-demo"
            >
              <Clock3 aria-hidden="true" size={18} />
              {request.waiting ? "Esperando…" : "Esperar"}
            </Button>
            <Button variant="secondary" type="button" onClick={onCancel}>
              Cancelar
            </Button>
            <Button
              variant="secondary"
              type="button"
              aria-pressed={request.noticeRequested}
              onClick={requestPendingNotice}
            >
              <Bell aria-hidden="true" size={18} />
              Avisarme
            </Button>
          </div>
          <p className={styles.help}>
            Cancelar abandona esta espera y conserva los artículos de tu
            carrito.
          </p>
          <p className={styles.noticeFeedback} role="status">
            {request.noticeRequested
              ? "Los avisos aún no están disponibles. Esta selección es demostrativa: no se enviarán SMS, correos ni notificaciones."
              : ""}
          </p>
        </section>
        <aside className={styles.summary} aria-labelledby="pending-summary">
          <h2 id="pending-summary">Tu selección se conserva</h2>
          <p className={styles.service}>
            {cartServiceOptions.find((option) => option.id === service)?.label}
          </p>
          <ul className={styles.items}>
            {rows.map((row) => (
              <li key={row.id}>
                <div className={styles.itemHeading}>
                  <strong>
                    {row.quantity} ×{" "}
                    {row.product?.name ?? "Producto fuera del menú"}
                  </strong>
                  <span>{formatMenuPrice(row.subtotal)}</span>
                </div>
                {row.choices.length ? (
                  <ul className={styles.modifiers}>
                    {row.choices.map((choice, index) => (
                      <li key={`${choice.id}-${index}`}>
                        {choice.name}
                        {choice.priceAdjustment
                          ? ` +${formatMenuPrice(choice.priceAdjustment)}`
                          : " · incluida"}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
          <div className={styles.subtotal}>
            <span>Subtotal</span>
            <strong>{formatMenuPrice(getCartSubtotal(rows))}</strong>
          </div>
          <p className={styles.help}>
            Tus cantidades y opciones permanecen intactas mientras navegas en
            esta sesión.
          </p>
        </aside>
      </div>
    </div>
  );
}
