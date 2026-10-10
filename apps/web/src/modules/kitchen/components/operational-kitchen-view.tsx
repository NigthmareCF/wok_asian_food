"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChefHat,
  Check,
  CircleAlert,
  Clock3,
  Package,
  RefreshCw,
  Send,
} from "lucide-react";
import { usePickupResource } from "@/modules/client-order-tracking/use-pickup-resource";
import {
  isKitchenTicket,
  isKitchenTickets,
  type KitchenTicket,
  type KitchenTicketStatus,
} from "@/modules/kitchen/live-contract";
import styles from "./kitchen-board.module.css";

type VisibleStatus = Exclude<KitchenTicketStatus, "CANCELLED">;
type StatusFilter = "all" | VisibleStatus;

const columns: {
  status: VisibleStatus;
  label: string;
  icon: typeof ChefHat;
  tone: "sent" | "preparing" | "ready" | "delayed";
}[] = [
  { status: "QUEUED", label: "Nuevas", icon: Send, tone: "sent" },
  {
    status: "PREPARING",
    label: "Preparando",
    icon: ChefHat,
    tone: "preparing",
  },
  { status: "READY", label: "Listas", icon: Check, tone: "ready" },
  {
    status: "RECALLED",
    label: "Devueltas",
    icon: CircleAlert,
    tone: "delayed",
  },
];

function elapsed(value: string | null) {
  if (!value) return "Sin hora";
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60_000),
  );
  return minutes < 1 ? "Ahora" : `${minutes} min`;
}

function source(ticket: KitchenTicket) {
  if (ticket.diningTableName) return ticket.diningTableName;
  const channel =
    ticket.channel === "PICKUP"
      ? "Para recoger"
      : ticket.channel === "DELIVERY"
        ? "Delivery"
        : ticket.channel;
  return ticket.accountName ? `${channel} · ${ticket.accountName}` : channel;
}

function messageFrom(body: unknown) {
  return body &&
    typeof body === "object" &&
    "message" in body &&
    typeof body.message === "string"
    ? body.message
    : "No pudimos actualizar la comanda.";
}

function useKitchenMutationLock() {
  const lock = useRef(false);
  const acquire = useCallback(() => {
    if (lock.current) return false;
    lock.current = true;
    return true;
  }, []);
  const release = useCallback(() => {
    lock.current = false;
  }, []);
  return { acquire, release };
}

export function OperationalKitchenView() {
  const open = usePickupResource(
    "/bff/operational/kitchen/tickets",
    isKitchenTickets,
    10_000,
  );
  const ready = usePickupResource(
    "/bff/operational/kitchen/tickets?status=READY",
    isKitchenTickets,
    10_000,
  );
  const [station, setStation] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const { acquire, release } = useKitchenMutationLock();
  const [feedback, setFeedback] = useState<string | null>(null);

  const tickets = useMemo(() => {
    const byId = new Map<string, KitchenTicket>();
    for (const ticket of [...(open.data ?? []), ...(ready.data ?? [])])
      byId.set(ticket.id, ticket);
    return [...byId.values()].filter((ticket) => ticket.status !== "CANCELLED");
  }, [open.data, ready.data]);
  const stations = useMemo(
    () => [...new Set(tickets.map((ticket) => ticket.stationCode))].sort(),
    [tickets],
  );
  const filteredTickets = tickets.filter(
    (ticket) => station === "all" || ticket.stationCode === station,
  );
  const ticketsForColumn = (status: KitchenTicketStatus) =>
    filteredTickets.filter((ticket) => ticket.status === status);
  const visibleColumns =
    statusFilter === "all"
      ? columns
      : columns.filter((column) => column.status === statusFilter);

  const reload = () => {
    setFeedback(null);
    open.reload();
    ready.reload();
  };

  const mutate = useCallback(
    async (ticket: KitchenTicket) => {
      if (!acquire()) return;
      setPendingId(ticket.id);
      setFeedback(null);
      const claim = ticket.status === "QUEUED";
      const nextStatus = ticket.status === "RECALLED" ? "PREPARING" : "READY";
      try {
        const response = await fetch(
          `/bff/operational/kitchen/tickets/${ticket.id}/${claim ? "claim" : "status"}`,
          {
            method: claim ? "POST" : "PATCH",
            signal: AbortSignal.timeout(15000),
            headers: {
              "X-Request-Id": crypto.randomUUID(),
              ...(!claim ? { "Content-Type": "application/json" } : {}),
            },
            ...(!claim
              ? {
                  body: JSON.stringify({
                    status: nextStatus,
                    expectedVersion: ticket.rowVersion,
                  }),
                }
              : {}),
          },
        );
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(messageFrom(body));
        if (!isKitchenTicket(body) || body.id !== ticket.id)
          throw new Error("Respuesta inválida de cocina.");
        setFeedback(
          claim
            ? `Comanda ${ticket.orderCode} tomada en cocina.`
            : nextStatus === "READY"
              ? `Comanda ${ticket.orderCode} marcada como lista.`
              : `Comanda ${ticket.orderCode} retomada.`,
        );
      } catch (error) {
        setFeedback(
          error instanceof Error
            ? error.message
            : "No pudimos actualizar la comanda.",
        );
      } finally {
        release();
        open.reload();
        ready.reload();
        setPendingId(null);
      }
    },
    [acquire, release, open, ready],
  );

  const error = open.error ?? ready.error;
  const loading = !error && (open.data == null || ready.data == null);

  return (
    <div className={styles.page}>
      <header className={`ops-page-header ${styles.header}`}>
        <div>
          <Link className="text-action" href="/operation">
            <ArrowLeft aria-hidden="true" size={16} /> Volver a operación
          </Link>
          <span className="ops-kicker">KDS · turno actual</span>
          <h1>Cocina</h1>
          <p>Acepta comandas y actualiza su preparación en tiempo real.</p>
        </div>
        <button
          className={`button button--secondary ${styles.connection}`}
          disabled={loading}
          onClick={reload}
          type="button"
        >
          <RefreshCw aria-hidden="true" size={17} /> Actualizar
        </button>
      </header>

      {feedback ? (
        <p className={styles.feedback} role="status">
          {feedback}
        </p>
      ) : null}
      {error ? (
        <div className={styles.reconnecting} role="alert">
          <CircleAlert aria-hidden="true" size={18} />
          <div>
            <strong>No pudimos cargar las comandas</strong>
            <span>{error.message}</span>
          </div>
          <button onClick={reload} type="button">
            Reintentar
          </button>
        </div>
      ) : null}

      <section className={styles.toolbar} aria-label="Controles de cocina">
        <div>
          <span>Estación</span>
          <div className={styles.segmented}>
            <button
              aria-pressed={station === "all"}
              onClick={() => setStation("all")}
              type="button"
            >
              Todas
            </button>
            {stations.map((item) => (
              <button
                aria-pressed={station === item}
                key={item}
                onClick={() => setStation(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span>Estado</span>
          <div className={styles.segmented}>
            <button
              aria-pressed={statusFilter === "all"}
              onClick={() => setStatusFilter("all")}
              type="button"
            >
              Todos <small>{filteredTickets.length}</small>
            </button>
            {columns.map((column) => (
              <button
                aria-pressed={statusFilter === column.status}
                key={column.status}
                onClick={() => setStatusFilter(column.status)}
                type="button"
              >
                {column.label}{" "}
                <small>{ticketsForColumn(column.status).length}</small>
              </button>
            ))}
          </div>
        </div>
      </section>

      {loading ? <p className={styles.loading}>Cargando comandas...</p> : null}
      {!loading ? (
        <section
          className={`${styles.board} ${statusFilter !== "all" ? styles.boardFocused : ""}`}
          aria-label="Tablero de comandas"
        >
          {visibleColumns.map((column) => {
            const ColumnIcon = column.icon;
            const columnTickets = ticketsForColumn(column.status);
            return (
              <section
                className={`${styles.column} ${styles[`column_${column.tone}`]}`}
                key={column.status}
                aria-labelledby={`kitchen-${column.status}`}
              >
                <header>
                  <ColumnIcon aria-hidden="true" size={18} />
                  <h2 id={`kitchen-${column.status}`}>{column.label}</h2>
                  <strong>{columnTickets.length}</strong>
                </header>
                <div className={styles.ticketList}>
                  {columnTickets.length ? (
                    columnTickets.map((ticket) => (
                      <article className={styles.ticket} key={ticket.id}>
                        <div className={styles.ticketHeading}>
                          <div>
                            <strong>
                              {ticket.orderCode} · #{ticket.sequence}
                            </strong>
                            <span>{source(ticket)}</span>
                          </div>
                          <span>
                            <Clock3 aria-hidden="true" size={14} />
                            {elapsed(ticket.oldestItemAt)}
                          </span>
                        </div>
                        <ul className={styles.items}>
                          {ticket.items.map((item) => (
                            <li
                              className={
                                item.action === "CANCELLED"
                                  ? styles.cancelled
                                  : undefined
                              }
                              key={`${ticket.id}-${item.orderItemId}`}
                            >
                              <strong>{item.quantity}×</strong>
                              <div>
                                <span>{item.name}</span>
                                {item.notes ? (
                                  <small>{item.notes}</small>
                                ) : null}
                                {item.fulfillment === "TAKEAWAY" ? (
                                  <small>
                                    <Package aria-hidden="true" size={12} />
                                    Para llevar
                                  </small>
                                ) : null}
                                {item.action === "CANCELLED" ? (
                                  <small>Producto retirado</small>
                                ) : item.action === "INCREASED" ? (
                                  <small>Cantidad agregada</small>
                                ) : null}
                              </div>
                            </li>
                          ))}
                        </ul>
                        <div className={styles.eta}>
                          <label>
                            <span>Estación</span>
                            <strong>{ticket.stationCode}</strong>
                          </label>
                          {ticket.status !== "READY" ? (
                            <button
                              className="button button--primary button--compact"
                              disabled={pendingId === ticket.id}
                              onClick={() => void mutate(ticket)}
                              type="button"
                            >
                              {ticket.status === "QUEUED" ? (
                                <ChefHat aria-hidden="true" size={16} />
                              ) : (
                                <Check aria-hidden="true" size={16} />
                              )}
                              {pendingId === ticket.id
                                ? "Guardando"
                                : ticket.status === "QUEUED"
                                  ? "Tomar"
                                  : ticket.status === "RECALLED"
                                    ? "Retomar"
                                    : "Marcar lista"}
                            </button>
                          ) : null}
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className={styles.empty}>
                      <ChefHat aria-hidden="true" size={21} />
                      <span>Sin comandas</span>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
