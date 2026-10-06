"use client";
import Link from "next/link";
import { useState } from "react";
import { useLiveResource } from "@/modules/operation/use-live-resource";
import { useLiveMutation } from "@/modules/operation/use-live-mutation";
import { isOrderDetails } from "@/modules/orders/live-contract";
import {
  ticketLabels,
  ticketLines,
  ticketTransitions,
} from "@/modules/orders/live-mapping";
import { mergeKitchenTickets } from "../live-mapping";
import {
  isKitchenTicket,
  isKitchenTickets,
  isStationLoads,
  type KitchenTicket,
} from "../live-contract";
import styles from "@/modules/operation/operational-flow.module.css";

export function KitchenBoardView() {
  const open = useLiveResource(
    "/bff/operational/kitchen/tickets?status=OPEN",
    isKitchenTickets,
    true,
  );
  const ready = useLiveResource(
    "/bff/operational/kitchen/tickets?status=READY",
    isKitchenTickets,
    true,
  );
  const load = useLiveResource(
    "/bff/operational/kitchen/load",
    isStationLoads,
    true,
  );
  const mutation = useLiveMutation();
  const [station, setStation] = useState(""),
    [expanded, setExpanded] = useState<string | null>(null);
  const tickets = mergeKitchenTickets(open.data ?? [], ready.data ?? []).filter(
    (t) => !station || t.stationId === station,
  );
  const error = open.error || ready.error || load.error;
  const available = !!open.data && !!ready.data && !error;
  function reload() {
    open.reload();
    ready.reload();
    load.reload();
  }
  function change(ticket: KitchenTicket) {
    const claim = ticket.status === "QUEUED";
    const next = claim || ticket.status === "RECALLED" ? "PREPARING" : "READY";
    if (!available || !ticketTransitions[ticket.status].includes(next)) return;
    void mutation.run({
      url:
        "/bff/operational/kitchen/tickets/" +
        ticket.id +
        (claim ? "/claim" : "/status"),
      method: claim ? "POST" : "PATCH",
      ...(claim
        ? {}
        : {
            body: {
              status: next,
              expectedVersion: ticket.rowVersion,
            },
          }),
      validate: isKitchenTicket,
      reload,
    });
  }
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Cocina</h1>
        <Link href="/operation/orders">Ver pedidos</Link>
        <button
          className="button button--secondary"
          disabled={mutation.sending}
          onClick={reload}
        >
          Actualizar
        </button>
      </header>
      <p>
        Se actualiza cada 15 segundos. Cada comanda corresponde a una estación.
      </p>
      {(error || mutation.error) && (
        <p role="alert">{mutation.error || error}</p>
      )}
      <label>
        Estación{" "}
        <select value={station} onChange={(e) => setStation(e.target.value)}>
          <option value="">Todas</option>
          {load.data?.map((s) => (
            <option key={s.stationId} value={s.stationId}>
              {s.stationCode}
            </option>
          ))}
        </select>
      </label>
      <section className={styles.grid} aria-label="Carga por estación">
        {load.data?.map((s) => (
          <article key={s.stationId} className={styles.card}>
            <h2>{s.stationCode}</h2>
            <p>
              En cola: {s.queued} · Preparando: {s.preparing} · Listos:{" "}
              {s.ready}
            </p>
          </article>
        ))}
      </section>
      {!open.data && !open.error && <p role="status">Cargando comandas…</p>}
      {available && !tickets.length && (
        <p>No hay comandas para esta estación.</p>
      )}
      <div className={styles.grid}>
        {tickets.map((ticket) => (
          <article
            className={styles.card}
            key={ticket.id}
            aria-label={ticket.orderCode + " · " + ticket.stationCode}
          >
            <h2>
              {ticket.orderCode} · {ticket.stationCode}
            </h2>
            <strong>{ticketLabels[ticket.status]}</strong>
            <p>
              {ticket.diningTableName ?? "Sin mesa"} · {ticket.accountName}
            </p>
            <p>
              {ticket.totalQuantity} unidades · {ticket.itemCount} líneas
            </p>
            {ticket.estimatedReadyAt && (
              <p>
                Estimado:{" "}
                {new Intl.DateTimeFormat("es-GT", {
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(ticket.estimatedReadyAt))}
              </p>
            )}
            <div className={styles.actions}>
              {["QUEUED", "PREPARING", "RECALLED"].includes(ticket.status) && (
                <button
                  className="button button--primary"
                  disabled={mutation.sending || !available}
                  onClick={() => change(ticket)}
                >
                  {ticket.status === "QUEUED"
                    ? "Tomar comanda"
                    : ticket.status === "RECALLED"
                      ? "Preparar de nuevo"
                      : "Marcar listo"}
                </button>
              )}
              <button
                className="button button--secondary"
                aria-expanded={expanded === ticket.id}
                onClick={() =>
                  setExpanded(expanded === ticket.id ? null : ticket.id)
                }
              >
                Ver productos
              </button>
              <Link href={"/operation/orders/" + ticket.orderId}>
                Ver pedido
              </Link>
            </div>
            {expanded === ticket.id && <TicketProducts ticket={ticket} />}
          </article>
        ))}
      </div>
      <div className={styles.actions}>
        <button className="button button--secondary" disabled>
          Cambiar ETA
        </button>
        <button className="button button--secondary" disabled>
          Editar líneas
        </button>
      </div>
    </div>
  );
}
function TicketProducts({ ticket }: { ticket: KitchenTicket }) {
  const resource = useLiveResource(
    "/bff/operational/orders/" + ticket.orderId,
    isOrderDetails,
  );
  return (
    <section aria-label="Productos de la estación">
      {resource.error && <p role="alert">{resource.error}</p>}
      {!resource.data && !resource.error && (
        <p role="status">Cargando productos…</p>
      )}
      {resource.data &&
        ticketLines(resource.data, ticket).map((item) => (
          <p key={item.id}>
            {item.quantity} × {item.name} ·{" "}
            {item.fulfillment === "TAKEAWAY" ? "Para llevar" : "En mesa"}
            {item.notes ? " · " + item.notes : ""}
          </p>
        ))}
      {resource.error && <button onClick={resource.reload}>Reintentar</button>}
    </section>
  );
}
