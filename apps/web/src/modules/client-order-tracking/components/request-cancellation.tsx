"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { useClientIdentity } from "@/modules/clients/use-client-identity";
import {
  clientIdentityStore,
  createClientOperation,
} from "@/modules/clients/client-identity-store";
import { isUuid } from "@/modules/checkout/pickup-contract";
import {
  isOrderChange,
  isOptionalOrderChange,
  parseCancellation,
} from "../change-contract";
import { useClientPickupResource } from "../use-client-pickup-resource";
import { isPickupCancellation } from "../pickup-details";
import styles from "./request-cancellation.module.css";
import { formatServiceDateTime } from "@/modules/checkout/service-time";

export function RequestCancellation({
  requestId,
  userId,
  reviewed = false,
  allowRequest = true,
  onChanged,
}: {
  requestId: string;
  userId?: string;
  reviewed?: boolean;
  allowRequest?: boolean;
  onChanged: () => void;
}) {
  const { identity, verified } = useClientIdentity(userId);
  if (!verified) return null;
  return (
    <CancellationForm
      key={`${identity.ownerId}:${identity.generation}:${requestId}:${reviewed}`}
      requestId={requestId}
      ownerId={identity.ownerId!}
      reviewed={reviewed}
      allowRequest={allowRequest}
      onChanged={onChanged}
    />
  );
}

function CancellationForm({
  requestId,
  ownerId,
  reviewed,
  allowRequest,
  onChanged,
}: {
  requestId: string;
  ownerId: string;
  reviewed: boolean;
  allowRequest: boolean;
  onChanged: () => void;
}) {
  const { identity } = useClientIdentity(ownerId);
  const storageKey = `wok.pickup.cancellation.v1:${ownerId}:${requestId}`;
  const [attempt, setAttempt] = useState<{
    key: string;
    reason: string;
  } | null>(() => {
    if (!reviewed || typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(storageKey);
      const parsed = raw && raw.length < 2000 ? JSON.parse(raw) : null;
      const payload = parseCancellation(parsed);
      return payload && isUuid(parsed.key)
        ? { key: parsed.key, reason: payload.reason }
        : null;
    } catch {
      return null;
    }
  });
  const [reason, setReason] = useState(attempt?.reason ?? "");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const active = useRef<ReturnType<typeof createClientOperation> | null>(null);
  const confirmation = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLSpanElement>(null);
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (confirming || attempt) confirmation.current?.focus();
    else if (wasConfirming.current)
      trigger.current?.querySelector<HTMLButtonElement>("button")?.focus();
    wasConfirming.current = confirming;
  }, [confirming, attempt]);
  const changes = useClientPickupResource(
    `/bff/order-requests/${requestId}/change-requests`,
    isOptionalOrderChange,
    ownerId,
    reviewed ? 10000 : 0,
  );
  useEffect(() => {
    return () => active.current?.dispose();
  }, []);
  async function submit() {
    if (active.current || !clientIdentityStore.matches(identity)) return;
    const payload = reviewed ? parseCancellation({ reason }) : null;
    if (reviewed && !payload) {
      setNotice("Indica un motivo de 3 a 500 caracteres.");
      return;
    }
    const operation = createClientOperation(identity);
    active.current = operation;
    setBusy(true);
    setNotice("");
    try {
      if (!(await operation.confirm()) || !operation.valid()) return;
      const saved = reviewed
        ? (attempt ?? { key: crypto.randomUUID(), reason: payload!.reason })
        : null;
      if (saved) {
        sessionStorage.setItem(storageKey, JSON.stringify(saved));
        setAttempt(saved);
        setReason(saved.reason);
      }
      const response = await fetch(
        reviewed
          ? `/bff/order-requests/${requestId}/change-requests`
          : `/bff/delivery-requests/${requestId}`,
        {
          method: reviewed ? "POST" : "DELETE",
          signal: operation.signal,
          headers: {
            "X-Wok-Expected-Principal": ownerId,
            ...(saved
              ? {
                  "Content-Type": "application/json",
                  "Idempotency-Key": saved.key,
                }
              : {}),
          },
          ...(saved ? { body: JSON.stringify({ reason: saved.reason }) } : {}),
        },
      );
      const result: unknown = await response.json();
      if (!operation.valid()) return;
      if (
        response.status === 401 ||
        (result &&
          typeof result === "object" &&
          "code" in result &&
          ["CLIENT_PRINCIPAL_CHANGED", "CLIENT_PRINCIPAL_UNVERIFIED"].includes(
            String(result.code),
          ))
      ) {
        clientIdentityStore.invalidate();
        return;
      }
      if (!(await operation.confirm()) || !operation.valid()) return;
      if (
        !response.ok &&
        response.status >= 400 &&
        response.status < 500 &&
        saved
      ) {
        sessionStorage.removeItem(storageKey);
        setAttempt(null);
        changes.reload();
        onChanged();
      }
      if (!response.ok)
        throw new Error(
          result &&
            typeof result === "object" &&
            "message" in result &&
            typeof result.message === "string"
            ? result.message
            : "Actualiza el estado antes de reintentar.",
        );
      if (
        !(reviewed
          ? isOrderChange(result) && result.orderRequestId === requestId
          : isPickupCancellation(result) && result.requestId === requestId)
      )
        throw new Error(
          "No pudimos confirmar el resultado. Reintenta con la misma solicitud.",
        );
      if (saved) {
        sessionStorage.removeItem(storageKey);
        setAttempt(null);
      }
      setNotice(
        reviewed
          ? "Solicitud registrada para revisión. El pedido sigue activo hasta la decisión del restaurante."
          : "Solicitud cancelada.",
      );
      setConfirming(false);
      changes.reload();
      onChanged();
    } catch (error) {
      if ((await operation.confirm()) && operation.valid())
        setNotice(
          error instanceof Error
            ? error.message
            : "Resultado incierto. Reintenta la misma solicitud.",
        );
    } finally {
      if (operation.valid()) setBusy(false);
      operation.dispose();
      active.current = null;
    }
  }
  const current = reviewed ? changes.data : null;
  const pending = current?.status === "PENDING_REVIEW";
  return (
    <section
      className={styles.form}
      aria-label={
        reviewed ? "Solicitar cancelación del pedido" : "Cancelar solicitud"
      }
    >
      {current && (
        <p role="status">
          Cancelación:{" "}
          {current.status === "PENDING_REVIEW"
            ? "pendiente de revisión"
            : current.status === "APPROVED"
              ? "aprobada"
              : "rechazada"}
          . {current.decisionReason}
        </p>
      )}
      {reviewed && changes.error && <p role="alert">{changes.error.message}</p>}
      {current && (
        <p>
          Motivo: {current.reason}. Solicitada:{" "}
          {formatServiceDateTime(current.requestedAt)}
          {current.decidedAt
            ? `. Resuelta: ${formatServiceDateTime(current.decidedAt)}`
            : ""}
          .
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {(allowRequest || attempt) &&
        !pending &&
        (!reviewed || !current || current.status === "REJECTED" || attempt) &&
        (confirming || attempt ? (
          <div ref={confirmation} tabIndex={-1} className={styles.confirmation}>
            <p>
              {reviewed
                ? "El equipo decidirá la cancelación. No cancela automáticamente el pedido ni genera devoluciones."
                : "El restaurante dejará de revisar esta solicitud."}
            </p>
            {reviewed && (
              <label>
                Motivo de cancelación
                <textarea
                  maxLength={1000}
                  minLength={3}
                  value={reason}
                  disabled={busy || !!attempt}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
            )}
            <Button disabled={busy} onClick={() => void submit()}>
              {busy
                ? "Enviando…"
                : attempt
                  ? "Reintentar misma solicitud"
                  : reviewed
                    ? "Enviar solicitud de cancelación"
                    : "Sí, cancelar solicitud"}
            </Button>
            {!attempt && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => setConfirming(false)}
              >
                Conservar solicitud
              </Button>
            )}
          </div>
        ) : (
          <span ref={trigger}>
            <Button onClick={() => setConfirming(true)}>
              {reviewed ? "Solicitar cancelación" : "Cancelar solicitud"}
            </Button>
          </span>
        ))}
    </section>
  );
}
