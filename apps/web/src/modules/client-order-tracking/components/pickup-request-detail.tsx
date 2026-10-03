"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
  formatPickupMoney,
  isPickupCancellation,
  isPickupDetails,
  pickupStatusLabels,
} from "../pickup-details";
import { usePickupResource } from "../use-pickup-resource";
import styles from "./client-order-list.module.css";

export function PickupRequestDetail({ requestId }: { requestId: string }) {
  const url = `/bff/order-requests/${encodeURIComponent(requestId)}`;
  const { data, error, reload } = usePickupResource(url, isPickupDetails);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [cancelError, setCancelError] = useState("");
  const sending = useRef(false);
  async function cancel() {
    if (sending.current || !data || data.status !== "PENDING_REVIEW") return;
    sending.current = true;
    setBusy(true);
    setCancelError("");
    setNotice("");
    try {
      const response = await fetch(url, {
        method: "DELETE",
        signal: AbortSignal.timeout(15_000),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message =
          result &&
          typeof result === "object" &&
          "message" in result &&
          typeof result.message === "string"
            ? result.message
            : "No pudimos confirmar la cancelación. Actualiza el estado antes de reintentar.";
        setCancelError(message);
      } else if (isPickupCancellation(result) && result.requestId === requestId)
        setNotice("La solicitud fue cancelada.");
      else throw new Error("Invalid cancellation response");
    } catch {
      setCancelError(
        "No pudimos confirmar la cancelación. Actualiza el estado antes de reintentar.",
      );
    } finally {
      setBusy(false);
      sending.current = false;
      setConfirming(false);
      reload();
    }
  }
  function refresh() {
    setConfirming(false);
    setNotice("");
    setCancelError("");
    reload();
  }
  return (
    <div className={styles.orders}>
      <header className={styles.header}>
        <h1>Detalle de solicitud para recoger</h1>
      </header>
      <Link href="/client/orders">Volver a mis solicitudes</Link>
      <Button variant="secondary" disabled={busy} onClick={refresh}>
        Actualizar estado
      </Button>
      {notice && <p role="status">{notice}</p>}
      {cancelError && <p role="alert">{cancelError}</p>}
      {error ? (
        <section role="alert">
          <p>{error.message}</p>
          {error.status === 401 ? (
            <Link
              href={`/login?next=${encodeURIComponent(`/client/orders/${requestId}`)}`}
            >
              Iniciar sesión
            </Link>
          ) : (
            error.status !== 404 && (
              <Button onClick={refresh}>Reintentar</Button>
            )
          )}
        </section>
      ) : !data ? (
        <p role="status">Consultando solicitud…</p>
      ) : (
        <>
          <section className={styles.order} aria-label="Datos de la solicitud">
            <h2>{pickupStatusLabels[data.status]}</h2>
            <p>Código: {data.requestId}</p>
            <p>
              Horario solicitado:{" "}
              {new Date(data.requestedFor).toLocaleString("es-GT")}
            </p>
            <p>
              Subtotal registrado:{" "}
              {formatPickupMoney(data.subtotal, data.currency)}
            </p>
            {data.customerNote && <p>Nota: {data.customerNote}</p>}
            <p>
              La solicitud no representa un pago. El estado se consulta al abrir
              o actualizar esta pantalla.
            </p>
          </section>
          <section className={styles.list} aria-label="Productos solicitados">
            {data.items.map((item, index) => (
              <article className={styles.order} key={`${item.name}-${index}`}>
                <h2>{item.name}</h2>
                <p>
                  {item.quantity} ×{" "}
                  {formatPickupMoney(item.unitPrice, data.currency)}
                </p>
                <p>Total: {formatPickupMoney(item.lineTotal, data.currency)}</p>
              </article>
            ))}
          </section>
          {data.status === "PENDING_REVIEW" &&
            (confirming ? (
              <section
                className={styles.order}
                aria-label="Confirmar cancelación"
              >
                <h2>¿Cancelar esta solicitud?</h2>
                <p>
                  El restaurante dejará de revisarla. Esta acción no realiza un
                  reembolso porque no se ha registrado un cobro.
                </p>
                <Button disabled={busy} onClick={cancel}>
                  {busy ? "Cancelando…" : "Sí, cancelar solicitud"}
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                >
                  Conservar solicitud
                </Button>
              </section>
            ) : (
              <Button onClick={() => setConfirming(true)}>
                Cancelar solicitud
              </Button>
            ))}
        </>
      )}
    </div>
  );
}
