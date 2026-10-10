"use client";
import { useEffect, useRef, useState } from "react";
import { usePickupResource } from "@/modules/client-order-tracking/use-pickup-resource";
import {
  isOrderChange,
  isOrderChanges,
  type OrderChange,
} from "@/modules/client-order-tracking/change-contract";
import { Button } from "@/shared/components/ui/button";
import { useClientIdentity } from "@/modules/clients/use-client-identity";
import {
  clientIdentityStore,
  createClientOperation,
} from "@/modules/clients/client-identity-store";
import { isUuid } from "@/modules/checkout/pickup-contract";
import { parseChangeDecision } from "@/modules/client-order-tracking/change-contract";

export function OrderChangeReview() {
  const { identity } = useClientIdentity();
  const { data, error, reload } = usePickupResource(
    "/bff/operational/order-change-requests",
    isOrderChanges,
    10000,
  );
  return (
    <section aria-label="Cancelaciones de pickup y delivery para revisar">
      <h2>Cancelaciones de pickup y delivery</h2>
      <Button variant="secondary" onClick={reload}>
        Actualizar cancelaciones
      </Button>
      {error ? (
        <p role="alert">{error.message}</p>
      ) : !data ? (
        <p role="status">Consultando cancelaciones…</p>
      ) : !data.length ? (
        <p>No hay cancelaciones pendientes.</p>
      ) : (
        data.map((item) => (
          <ChangeDecision
            key={`${identity.ownerId}:${identity.generation}:${item.id}:${item.version}`}
            change={item}
            onChanged={reload}
          />
        ))
      )}
    </section>
  );
}
function ChangeDecision({
  change,
  onChanged,
}: {
  change: OrderChange;
  onChanged: () => void;
}) {
  const [reason, setReason] = useState("");
  const [override,setOverride]=useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const { identity, verified } = useClientIdentity();
  const storageKey = `wok.pickup.decision.v1:${identity.ownerId}:${change.id}`;
  const [attempt, setAttempt] = useState<{
    key: string;
    decision: "APPROVE" | "REJECT";
    reason: string;
    expectedVersion: number;
    override?:boolean;
  } | null>(() => {
    try {
      const raw =
        typeof window === "undefined"
          ? null
          : sessionStorage.getItem(storageKey);
      const stored = raw && raw.length < 2000 ? JSON.parse(raw) : null;
      const previous = parseChangeDecision(stored);
      return previous && isUuid(stored.key)
        ? {
            key: stored.key,
            decision: previous.decision as "APPROVE" | "REJECT",
            reason: previous.reason ?? "",
            expectedVersion: Number(previous.expectedVersion),
            override:previous.override===true,
          }
        : null;
    } catch {
      return null;
    }
  });
  const lock = useRef(false);
  const active = useRef<ReturnType<typeof createClientOperation> | null>(null);
  useEffect(() => () => active.current?.dispose(), []);
  async function decide(decision: "APPROVE" | "REJECT") {
    if (lock.current || !verified || !clientIdentityStore.matches(identity))
      return;
    const parsed = parseChangeDecision({
      decision,
      expectedVersion: change.version,
      reason,override,
    });
    if (!attempt && !parsed) {
      setNotice(
        "Indica un motivo de 3 a 500 caracteres; es opcional al aprobar.",
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    setNotice("");
    const operation = createClientOperation(identity);
    active.current = operation;
    try {
      if (!(await operation.confirm()) || !operation.valid()) return;
      const saved = attempt ?? {
        key: crypto.randomUUID(),
        decision,
        reason: reason.trim(),
        expectedVersion: change.version,override,
      };
      sessionStorage.setItem(storageKey, JSON.stringify(saved));
      setAttempt(saved);
      const response = await fetch(
        `/bff/operational/order-change-requests/${change.id}`,
        {
          method: "PATCH",
          signal: operation.signal,
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": saved.key,
            "X-Financial-Actor": identity.ownerId!,
          },
          body: JSON.stringify({
            decision: saved.decision,
            reason: saved.reason || null,
            expectedVersion: saved.expectedVersion,override:saved.override===true,
          }),
        },
      );
      const result: unknown = await response.json();
      if (
        !operation.valid() ||
        !(await operation.confirm()) ||
        !operation.valid()
      )
        return;
      if (!response.ok && response.status >= 400 && response.status < 500) {
        sessionStorage.removeItem(storageKey);
        setAttempt(null);
        onChanged();
      }
      if (!response.ok || !isOrderChange(result) || result.id !== change.id)
        throw new Error(
          result &&
            typeof result === "object" &&
            "message" in result &&
            typeof result.message === "string"
            ? result.message
            : "Resultado incierto. Reintenta la misma decisión.",
        );
      sessionStorage.removeItem(storageKey);
      setNotice("Decisión registrada.");
      setAttempt(null);
      onChanged();
    } catch (failure) {
      if ((await operation.confirm()) && operation.valid())
        setNotice(
          failure instanceof Error
            ? failure.message
            : "Resultado incierto. Reintenta la misma decisión.",
        );
    } finally {
      if (operation.valid()) {
        lock.current = false;
        setBusy(false);
      }
      operation.dispose();
      active.current = null;
    }
  }
  return (
    <article>
      <h3>Pedido {change.orderCode}</h3>
      <p>Motivo del cliente: {change.reason}</p>
      <p>
        Aprobar cancela el pedido si su versión y estado lo permiten. Los pagos
        registrados requieren atención financiera; no se generan devoluciones.
      </p>
      <label><input type="checkbox" checked={override} disabled={busy||!!attempt} onChange={e=>setOverride(e.target.checked)}/>Solicitar override ADMIN con motivo para PREPARING/READY. El backend verifica la autorización.</label>
      <label>
        Motivo de decisión
        <textarea
          value={reason}
          maxLength={1000}
          disabled={busy || !!attempt}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {notice && <p role="status">{notice}</p>}
      {attempt ? (
        <>
          <p>
            Decisión pendiente de confirmar:{" "}
            {attempt.decision === "APPROVE"
              ? "aprobar cancelación"
              : "rechazar cancelación"}
            . {attempt.reason}
          </p>
          <Button
            disabled={busy || !verified}
            onClick={() => void decide(attempt.decision)}
          >
            Reintentar misma decisión
          </Button>
        </>
      ) : (
        <>
          <Button
            disabled={busy || !verified}
            onClick={() => void decide("APPROVE")}
          >
            Aprobar cancelación
          </Button>
          <Button
            variant="secondary"
            disabled={busy || !verified}
            onClick={() => void decide("REJECT")}
          >
            Rechazar cancelación
          </Button>
        </>
      )}
    </article>
  );
}
