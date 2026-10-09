"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePickupResource } from "@/modules/client-order-tracking/use-pickup-resource";
import { isAccountBalances, formatMoney, object } from "../live-contract";
import { useFinancialAttempts } from "../financial-attempt-provider";
import {
  isAttemptHistory,
  isResolutionQueue,
  type DurableAttempt,
  type ResolutionQueueItem,
} from "../attempt-contract";
export function PaymentsListView({
  administrativeOnly = false,
}: {
  administrativeOnly?: boolean;
}) {
  const owner = useFinancialAttempts(),
    identity = owner.identity,
    valid = owner.valid,
    ensure = owner.ensureSession;
  const [accountVersion, setAccountVersion] = useState(0);
  const [own, setOwn] = useState<DurableAttempt[]>([]),
    [queue, setQueue] = useState<ResolutionQueueItem[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [reviewCursor, setReviewCursor] = useState<string | null>(null),
    [error, setError] = useState("");
  const mounted = useRef(true),
    sequence = useRef(0);
  const canManage = owner.permissions.includes("payments:manage"),
    canReview = canManage && owner.permissions.includes("payments:resolve");
  const load = useCallback(
    async (kind: "own" | "review", after?: string) => {
      const ticket = identity(),
        seq = sequence.current;
      const check = () =>
        mounted.current && valid(ticket) && sequence.current === seq;
      try {
        await ensure(
          kind === "review"
            ? ["payments:manage", "payments:resolve"]
            : ["payments:manage"],
        );
        if (!check()) return;
        const response = await fetch(
          "/bff/operational/" +
            (kind === "own"
              ? "payment-attempts"
              : "payment-attempt-resolutions") +
            (after ? "?cursor=" + encodeURIComponent(after) : ""),
          {
            cache: "no-store",
            headers: { "X-Financial-Actor": ticket.userId },
          },
        );
        if (!check()) return;
        const body: unknown = await response.json().catch(() => null);
        if (!check()) return;
        if (!response.ok)
          throw Error(
            object(body) && typeof body.message === "string"
              ? body.message
              : "Consulta no disponible.",
          );
        if (kind === "own" && isAttemptHistory(body)) {
          setOwn((old) =>
            after
              ? [
                  ...old,
                  ...body.items.filter(
                    (i) => !old.some((j) => j.attemptId === i.attemptId),
                  ),
                ]
              : body.items,
          );
          setCursor(body.nextCursor ?? null);
        } else if (kind === "review" && isResolutionQueue(body)) {
          setQueue((old) =>
            after
              ? [
                  ...old,
                  ...body.items.filter(
                    (i) => !old.some((j) => j.attemptId === i.attemptId),
                  ),
                ]
              : body.items,
          );
          setReviewCursor(body.nextCursor ?? null);
        } else
          throw Error("Respuesta de intentos inválida; no autoriza acciones.");
        setError("");
      } catch (cause) {
        if (check())
          setError(
            cause instanceof Error ? cause.message : "No se pudo consultar.",
          );
      }
    },
    [identity, valid, ensure],
  );
  const cancelReads = useCallback(() => {
    mounted.current = false;
    sequence.current++;
  }, []);
  useEffect(() => {
    mounted.current = true;
    const refresh = () => {
      if (canManage && !administrativeOnly) void load("own");
      if (canReview) void load("review");
    };
    const timer = setTimeout(refresh, 0);
    const logout = () => {
      sequence.current++;
      setOwn([]);
      setQueue([]);
      setCursor(null);
      setReviewCursor(null);
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("wok:logout", logout);
    return () => {
      cancelReads();
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("wok:logout", logout);
    };
  }, [canManage, canReview, load, cancelReads, administrativeOnly]);
  return (
    <div className="payments-page">
      <header className="ops-page-header">
        <div>
          {administrativeOnly ? (
            <Link className="text-action" href="/admin">
              Volver a administración
            </Link>
          ) : null}
          <span className="ops-kicker">Cobro presencial</span>
          <h1>
            {administrativeOnly
              ? "Revisión de intentos presenciales"
              : "Cuentas y pagos"}
          </h1>
          <p>
            {administrativeOnly
              ? "Consulta y resolución excepcional; no registra cobros como otro operador."
              : "Cuentas abiertas, parcialmente pagadas y pagadas pendientes de finalización."}
          </p>
        </div>
        <button
          className="button button--secondary"
          onClick={() => {
            setAccountVersion((v) => v + 1);
            if (canManage) void load("own");
            if (canReview) void load("review");
          }}
        >
          Actualizar
        </button>
      </header>
      {error ? <p role="alert">{error}</p> : null}
      {!administrativeOnly ? (
        <OperationalPaymentAccounts key={accountVersion} />
      ) : null}
      {canManage && !administrativeOnly ? (
        <section className="ops-work-panel">
          <h2>Mis intentos</h2>
          <p>
            Disponibles aunque la cuenta ya no aparezca en la lista. Abrir solo
            consulta; confirmar captura es una acción separada.
          </p>
          {own.length ? (
            own.map((i) => (
              <p key={i.attemptId}>
                {i.status} · {formatMoney(i.amount, i.currency)} ·{" "}
                <Link
                  href={
                    "/operation/payments/" +
                    i.accountId +
                    "?selectedAttempt=" +
                    i.attemptId
                  }
                  onClick={() => owner.select(i.accountId, i.attemptId)}
                >
                  Consultar intento {i.attemptId}
                </Link>
              </p>
            ))
          ) : (
            <p>Sin intentos propios en esta página.</p>
          )}
          {cursor ? (
            <button
              className="button button--secondary"
              onClick={() => void load("own", cursor)}
            >
              Más intentos propios
            </button>
          ) : null}
        </section>
      ) : null}
      {canReview ? (
        <section className="ops-work-panel">
          <h2>Intentos que requieren revisión</h2>
          <p>
            Consulta excepcional separada. No autoriza capturar como otro
            operador ni resolver un intento creado por ti.
          </p>
          {queue.map((i) => (
            <p key={i.attemptId}>
              {i.status} · Cuenta {i.accountId} · Versión {i.version} ·{" "}
              <Link
                href={
                  "/admin/payment-attempts/" +
                  i.accountId +
                  "?reviewAttempt=" +
                  i.attemptId
                }
              >
                Revisar intento {i.attemptId}
              </Link>
            </p>
          ))}
          {!queue.length ? (
            <p>Sin intentos activos para revisión en esta página.</p>
          ) : null}
          {reviewCursor ? (
            <button
              className="button button--secondary"
              onClick={() => void load("review", reviewCursor)}
            >
              Más revisiones
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function OperationalPaymentAccounts() {
  const r = usePickupResource("/bff/operational/accounts", isAccountBalances);
  return (
    <>
      {r.error ? <p role="alert">{r.error.message}</p> : null}
      {!r.data && !r.error ? <p role="status">Cargando cuentas…</p> : null}
      {r.data?.length === 0 ? (
        <div className="ops-empty-state">
          No hay cuentas presenciales pendientes.
        </div>
      ) : null}
      <div className="payments-list">
        {r.data?.map((a) => (
          <section className="ops-work-panel" key={a.account.id}>
            <h2>
              {a.account.diningTableName} · {a.account.name}
            </h2>
            <p>
              {a.account.status} · {a.pendingOrderCount} pedidos pendientes ·{" "}
              {a.unfinalizedOrderCount} sin finalizar
            </p>
            {a.currencyTotals.map((t) => (
              <p key={t.currency}>
                Total: {formatMoney(t.total, t.currency)} · Pagado:{" "}
                {formatMoney(t.paid, t.currency)} · Saldo:{" "}
                <strong>{formatMoney(t.balance, t.currency)}</strong>
              </p>
            ))}
            {a.currencies.length > 1 ? (
              <p role="alert">
                Distintas monedas: requiere revisión; no se pueden sumar ni
                cobrar juntas.
              </p>
            ) : null}
            <Link
              className="button button--primary"
              href={"/operation/payments/" + a.account.id}
            >
              Consultar cuenta
            </Link>{" "}
            <Link
              className="button button--secondary"
              href={"/operation/payments/" + a.account.id + "/prebill"}
            >
              Precuenta
            </Link>
          </section>
        ))}
      </div>
    </>
  );
}
