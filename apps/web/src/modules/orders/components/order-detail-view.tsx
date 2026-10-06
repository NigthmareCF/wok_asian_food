"use client";
import Link from "next/link";
import { useState } from "react";
import { useLiveResource } from "@/modules/operation/use-live-resource";
import { useLiveMutation } from "@/modules/operation/use-live-mutation";
import {
  isOrderDetails,
  isOrderSummary,
  type OrderStatus,
} from "../live-contract";
import {
  amount,
  orderLabels,
  orderTransitions,
  ticketLabels,
} from "../live-mapping";
import styles from "@/modules/operation/operational-flow.module.css";
export function OrderDetailView({ orderId }: { orderId: string }) {
  const resource = useLiveResource(
    "/bff/operational/orders/" + encodeURIComponent(orderId),
    isOrderDetails,
    true,
  );
  const mutation = useLiveMutation();
  const [cancel, setCancel] = useState(false);
  const [reason, setReason] = useState("");
  const details = resource.data,
    order = details?.order;
  function change(status: OrderStatus) {
    if (!order || !orderTransitions[order.status].includes(status)) return;
    void mutation.run({
      url: "/bff/operational/orders/" + order.id + "/status",
      method: "PATCH",
      body: {
        status,
        expectedVersion: order.rowVersion,
        ...(status === "CANCELLED" ? { reason } : {}),
      },
      validate: isOrderSummary,
      reload: resource.reload,
      success: () => setCancel(false),
    });
  }
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/operation/orders">Volver a pedidos</Link>
        <button
          className="button button--secondary"
          disabled={mutation.sending}
          onClick={resource.reload}
        >
          Actualizar
        </button>
      </header>
      <h1>{order?.code ?? "Detalle de pedido"}</h1>
      {(resource.error || mutation.error) && (
        <p role="alert">{mutation.error || resource.error}</p>
      )}
      {!details && !resource.error && <p role="status">Cargando pedido…</p>}
      {details && order && (
        <>
          <section className={styles.card}>
            <h2>{orderLabels[order.status]}</h2>
            <p>
              {order.diningTableName ?? "Sin mesa"} · {order.accountName} ·{" "}
              {order.guestCount} personas
            </p>
            <dl className={styles.details}>
              <dt>Subtotal</dt>
              <dd>{amount(order.subtotal, order.currency)}</dd>
              <dt>Descuento</dt>
              <dd>{amount(order.discount, order.currency)}</dd>
              <dt>Total</dt>
              <dd>{amount(order.total, order.currency)}</dd>
            </dl>
            <div className={styles.actions}>
              {order.status === "READY" && (
                <button
                  className="button button--primary"
                  disabled={mutation.sending}
                  onClick={() => change("SERVED")}
                >
                  Marcar servido
                </button>
              )}
              {order.status === "SERVED" && (
                <button
                  className="button button--primary"
                  disabled={mutation.sending}
                  onClick={() => change("CLOSED")}
                >
                  Cerrar pedido
                </button>
              )}
              {["SENT", "PREPARING", "READY"].includes(order.status) && (
                <button
                  className="button button--secondary"
                  disabled={mutation.sending}
                  onClick={() => setCancel(true)}
                >
                  Anular pedido
                </button>
              )}
            </div>
            {cancel && orderTransitions[order.status].includes("CANCELLED") && (
              <form
                aria-label="Confirmar anulación"
                className={styles.form}
                onSubmit={(e) => {
                  e.preventDefault();
                  change("CANCELLED");
                }}
              >
                <label>
                  Motivo de anulación
                  <textarea
                    maxLength={300}
                    value={reason}
                    disabled={mutation.sending}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <p>¿Confirmas la anulación de este pedido?</p>
                <div className={styles.actions}>
                  <button
                    className="button button--primary"
                    disabled={mutation.sending}
                  >
                    Confirmar anulación
                  </button>
                  <button
                    type="button"
                    className="button button--secondary"
                    disabled={mutation.sending}
                    onClick={() => setCancel(false)}
                  >
                    Volver
                  </button>
                </div>
              </form>
            )}
          </section>
          <section>
            <h2>Productos</h2>
            <div className={styles.grid}>
              {details.items.map((item) => (
                <article className={styles.card} key={item.id}>
                  <h3>{item.name}</h3>
                  <p>
                    {item.quantity} × {amount(item.unitPrice, order.currency)}
                  </p>
                  <strong>{amount(item.lineTotal, order.currency)}</strong>
                  <p>
                    {item.fulfillment === "TAKEAWAY"
                      ? "Para llevar"
                      : "En mesa"}{" "}
                    · {item.stationCode}
                  </p>
                  {item.notes && <p>{item.notes}</p>}
                </article>
              ))}
            </div>
          </section>
          <section>
            <h2>Cocina</h2>
            <p>El estado se actualiza cada 15 segundos.</p>
            <Link href="/operation/kitchen">Ver cocina</Link>
            {details.tickets.map((ticket) => (
              <p key={ticket.id}>
                {ticket.stationCode} · Comanda {ticket.sequence} ·{" "}
                {ticketLabels[ticket.status]}
              </p>
            ))}
          </section>
          <section className={styles.card}>
            <h2>Acciones no disponibles</h2>
            <p>Estas acciones todavía no están disponibles.</p>
            <div className={styles.actions}>
              {[
                "Editar líneas",
                "Agregar productos al pedido",
                "Modificar extras",
                "Cambiar ETA",
                "Dividir cuenta",
                "Cobrar",
              ].map((label) => (
                <button
                  className="button button--secondary"
                  key={label}
                  disabled
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
