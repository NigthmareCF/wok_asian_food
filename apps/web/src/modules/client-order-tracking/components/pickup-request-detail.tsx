"use client";
import { formatServiceDateTime } from "@/modules/checkout/service-time";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
  formatPickupMoney,
  isPickupCancellation,
  isPickupDetails,
  pickupOrderStatusLabels,
  pickupStatusLabels,
} from "../pickup-details";
import { useClientPickupResource } from "../use-client-pickup-resource";
import {
  clientIdentityStore,
  createClientOperation,
  type ClientIdentity,
} from "@/modules/clients/client-identity-store";
import { useClientIdentity } from "@/modules/clients/use-client-identity";
import styles from "./client-order-list.module.css";
import { RequestCancellation } from "./request-cancellation";

export function PickupRequestDetail({
  requestId,
  userId,
}: {
  requestId: string;
  userId?: string;
}) {
  const { identity, verified, refresh } = useClientIdentity(userId);
  if (!verified)
    return (
      <section>
        <h1>Detalle de solicitud para recoger</h1>
        <p role="status">Verifica tu sesión para continuar.</p>
        <Button onClick={() => void refresh()}>Verificar sesión</Button>
        <Link href="/login?next=%2Fclient%2Forders">Iniciar sesión</Link>
      </section>
    );
  return (
    <VerifiedPickupRequestDetail
      key={`${identity.ownerId}:${identity.generation}:${requestId}`}
      scope={identity}
      requestId={requestId}
    />
  );
}

function VerifiedPickupRequestDetail({
  requestId,
  scope,
}: {
  requestId: string;
  scope: ClientIdentity;
}) {
  const operations = useRef(
    new Set<ReturnType<typeof createClientOperation>>(),
  );
  useEffect(() => {
    const active = operations.current;
    return () => {
      active.forEach((operation) => operation.dispose());
      active.clear();
    };
  }, []);
  const url = `/bff/order-requests/${encodeURIComponent(requestId)}`;
  const { data, error, reload } = useClientPickupResource(
    url,
    isPickupDetails,
    scope.ownerId!,
  );
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [cancelError, setCancelError] = useState("");
  const sending = useRef(false);
  async function cancel() {
    if (
      sending.current ||
      !data ||
      data.status !== "PENDING_REVIEW" ||
      !clientIdentityStore.matches(scope)
    )
      return;
    sending.current = true;
    setBusy(true);
    setCancelError("");
    setNotice("");
    const operation = createClientOperation(scope);
    operations.current.add(operation);
    try {
      if (!(await operation.confirm()) || !operation.valid()) return;
      const response = await fetch(url, {
        method: "DELETE",
        headers: { "X-Wok-Expected-Principal": scope.ownerId! },
        signal: operation.signal,
      });
      if (!operation.valid()) return;
      const result: unknown = await response.json();
      if (!operation.valid()) return;
      if (response.status === 401) {
        clientIdentityStore.invalidate();
        return;
      }
      if (
        result &&
        typeof result === "object" &&
        "code" in result &&
        ((response.status === 409 &&
          result.code === "CLIENT_PRINCIPAL_CHANGED") ||
          (response.status === 503 &&
            result.code === "CLIENT_PRINCIPAL_UNVERIFIED"))
      ) {
        clientIdentityStore.invalidate();
        return;
      }
      if (!(await operation.confirm()) || !operation.valid()) return;
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
      if (!(await operation.confirm()) || !operation.valid()) return;
      setCancelError(
        "No pudimos confirmar la cancelación. Actualiza el estado antes de reintentar.",
      );
    } finally {
      if (operation.valid()) {
        setBusy(false);
        sending.current = false;
        setConfirming(false);
        reload();
      }
      operation.dispose();
      operations.current.delete(operation);
    }
  }
  function refresh() {
    if (!clientIdentityStore.matches(scope)) return;
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
              Horario solicitado: {formatServiceDateTime(data.requestedFor)}
            </p>
            <p>
              Subtotal registrado:{" "}
              {formatPickupMoney(data.subtotal, data.currency)}
            </p>
            {data.orderStatus && (
              <p>
                Estado del pedido:{" "}
                <strong>{pickupOrderStatusLabels[data.orderStatus]}</strong>
              </p>
            )}
            {data.customerNote && <p>Nota: {data.customerNote}</p>}
            <p>
              {data.orderStatus === "READY"
                ? "Tu pedido está listo para recoger. Preséntate con el personal para continuar con la entrega y el pago."
                : "La solicitud no representa un pago. El estado se consulta al abrir o actualizar esta pantalla."}
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
          {data.status === "ACCEPTED" && data.orderStatus && (
            <RequestCancellation
              requestId={requestId}
              userId={scope.ownerId!}
              reviewed
              allowRequest={["SENT", "PREPARING", "READY"].includes(
                data.orderStatus,
              )}
              onChanged={reload}
            />
          )}
        </>
      )}
    </div>
  );
}
