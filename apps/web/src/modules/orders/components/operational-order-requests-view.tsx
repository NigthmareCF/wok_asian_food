"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { usePickupResource } from "@/modules/client-order-tracking/use-pickup-resource";
import { Check, Clock3, RefreshCw, X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  isOperationalOrderRequests,
  isOrderRequestDecisionResult,
  orderRequestStatuses,
  type OrderRequestStatus,
} from "../order-request-contract";
import styles from "./operational-order-requests.module.css";

const labels: Record<OrderRequestStatus, string> = {
  PENDING_REVIEW: "Pendiente",
  ACCEPTED: "Aceptada",
  REJECTED: "Rechazada",
  CANCELLED: "Cancelada",
  EXPIRED: "Vencida",
};

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("es-GT", { style: "currency", currency }).format(
    amount,
  );

export function OperationalOrderRequestsView() {
  const [filter, setFilter] = useState<OrderRequestStatus | "ALL">(
    "PENDING_REVIEW",
  );
  const [selectedId, setSelectedId] = useState<string>();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const decisionLock = useRef(false);

  const query = filter === "ALL" ? "" : `?status=${filter}`;
  const resource = usePickupResource(
    `/bff/operational/order-requests${query}`,
    isOperationalOrderRequests,
    busy ? 0 : 10_000,
  );
  const requests = useMemo(() => resource.data ?? [], [resource.data]);
  const loading = !resource.data && !resource.error;
  const load = resource.reload;

  const selected = useMemo(
    () =>
      requests.find((entry) => entry.requestId === selectedId) ?? requests[0],
    [requests, selectedId],
  );

  async function decide(action: "ACCEPT" | "REJECT") {
    if (
      !selected ||
      decisionLock.current ||
      (action === "REJECT" && !reason.trim())
    )
      return;
    decisionLock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/bff/operational/order-requests/${selected.requestId}/decision`,
        {
          method: "POST",
          signal: AbortSignal.timeout(15000),
          headers: {
            "Content-Type": "application/json",
            "X-Request-Id": crypto.randomUUID(),
          },
          body: JSON.stringify({
            action,
            ...(reason.trim() ? { reason: reason.trim() } : {}),
          }),
        },
      );
      const data = (await response.json()) as {
        message?: string;
        orderId?: string;
      };
      if (!response.ok) throw new Error(data.message);
      if (
        !isOrderRequestDecisionResult(data) ||
        !("requestId" in data) ||
        data.requestId !== selected.requestId ||
        !("status" in data) ||
        data.status !== (action === "ACCEPT" ? "ACCEPTED" : "REJECTED")
      )
        throw new Error(
          "Respuesta incierta. Consulta el estado actual antes de reintentar.",
        );
      setMessage(
        action === "ACCEPT"
          ? "Solicitud aceptada y enviada al flujo de pedidos."
          : "Solicitud rechazada con el motivo registrado.",
      );
      setReason("");
    } catch (failure) {
      setError(
        failure instanceof Error && failure.message
          ? failure.message
          : "No pudimos registrar la decisión.",
      );
    } finally {
      decisionLock.current = false;
      await load();
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <span className="eyebrow">SOLICITUDES REALES</span>
          <h1>Solicitudes en línea</h1>
          <p>
            Revisa disponibilidad antes de convertir una solicitud en pedido.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw aria-hidden="true" size={17} /> Actualizar
        </Button>
      </header>

      <div
        className={styles.filters}
        role="group"
        aria-label="Filtrar solicitudes"
      >
        <button
          type="button"
          aria-pressed={filter === "ALL"}
          onClick={() => setFilter("ALL")}
        >
          Todas
        </button>
        {orderRequestStatuses.map((status) => (
          <button
            key={status}
            type="button"
            aria-pressed={filter === status}
            onClick={() => setFilter(status)}
          >
            {labels[status]}
          </button>
        ))}
      </div>
      {message ? (
        <p role="status" className={styles.success}>
          {message}
        </p>
      ) : null}
      {error || resource.error ? (
        <p role="alert" className={styles.error}>
          {error || resource.error?.message}
        </p>
      ) : null}

      <div className={styles.layout}>
        <section className={styles.list} aria-label="Solicitudes">
          {loading ? <p>Cargando solicitudes…</p> : null}
          {!loading && !requests.length ? (
            <p>No hay solicitudes con este estado.</p>
          ) : null}
          {requests.map((entry) => (
            <button
              type="button"
              key={entry.requestId}
              aria-pressed={entry.requestId === selectedId}
              onClick={() => {
                setSelectedId(entry.requestId);
                setReason("");
              }}
            >
              <span>
                <strong>{entry.customerName}</strong>
                <small>{entry.customerEmail}</small>
              </span>
              <span className={styles.status}>{labels[entry.status]}</span>
              <small>
                <Clock3 aria-hidden="true" size={13} />{" "}
                {new Date(entry.requestedFor).toLocaleString("es-GT")}
              </small>
            </button>
          ))}
        </section>

        {selected ? (
          <article className={`panel ${styles.detail}`}>
            <header>
              <div>
                <span className="eyebrow">
                  {selected.fulfillmentType === "PICKUP"
                    ? "PARA RECOGER"
                    : "DELIVERY"}
                </span>
                <h2>{selected.customerName}</h2>
              </div>
              <strong>{money(selected.subtotal, selected.currency)}</strong>
            </header>
            <dl>
              <div>
                <dt>Solicitada</dt>
                <dd>
                  {new Date(selected.submittedAt).toLocaleString("es-GT")}
                </dd>
              </div>
              <div>
                <dt>Recogida</dt>
                <dd>
                  {new Date(selected.requestedFor).toLocaleString("es-GT")}
                </dd>
              </div>
            </dl>
            <section
              className={styles.items}
              aria-label="Productos solicitados"
            >
              <h3>Productos</h3>
              {selected.items.map((item) => (
                <p key={`${item.name}-${item.quantity}`}>
                  <span>
                    {item.quantity} × {item.name}
                  </span>
                  <strong>{money(item.lineTotal, selected.currency)}</strong>
                </p>
              ))}
            </section>
            {selected.customerNote ? (
              <p>
                <strong>Nota:</strong> {selected.customerNote}
              </p>
            ) : null}
            {selected.orderId ? (
              <Link href={`/operation/orders/${selected.orderId}`}>
                Abrir pedido vinculado
              </Link>
            ) : null}
            {selected.status === "PENDING_REVIEW" ? (
              <div className={styles.actions}>
                <Button
                  onClick={() => void decide("ACCEPT")}
                  disabled={busy || selected.fulfillmentType !== "PICKUP"}
                >
                  <Check aria-hidden="true" size={17} /> Aceptar y crear pedido
                </Button>
                <label>
                  Motivo para rechazar
                  <textarea
                    maxLength={500}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
                <Button
                  variant="secondary"
                  onClick={() => void decide("REJECT")}
                  disabled={busy || !reason.trim()}
                >
                  <X aria-hidden="true" size={17} /> Rechazar
                </Button>
              </div>
            ) : null}
          </article>
        ) : null}
      </div>
    </div>
  );
}
