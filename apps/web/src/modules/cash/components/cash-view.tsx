"use client";
import Link from "next/link";
import { useState } from "react";
import { formatMoney, parseAmount } from "@/modules/payments/live-contract";
import { useLiveCashSession } from "../use-live-cash-session";
export function CashView() {
  const [register, setRegister] = useState("MAIN");
  const cash = useLiveCashSession(register);
  const [opening, setOpening] = useState(""),
    [count, setCount] = useState<{
      sessionId: string;
      version: number;
      amount: string;
    } | null>(null);
  const [counting, setCounting] = useState(false),
    [feedback, setFeedback] = useState("");
  const s = cash.session,
    permitted = cash.permissions.includes("cash:manage");
  const sameTurn = !!count && count.sessionId === s?.id;
  const version = sameTurn ? count.version : null;
  const stale = counting && sameTurn && s?.rowVersion !== count.version;
  const counted = parseAmount(sameTurn ? count.amount : ""),
    initial = parseAmount(opening);
  async function close() {
    if (!s || !sameTurn || version === null || counted === null || stale)
      return;
    const ok = await cash.close(count.sessionId, counted, version);
    if (ok) {
      setCounting(false);
      setFeedback("Cierre confirmado por el servidor.");
    }
  }
  return (
    <div className="cash-page">
      <header className="ops-page-header cash-page__header">
        <div>
          <Link className="text-action" href="/operation">
            Volver a operación
          </Link>
          <span className="ops-kicker">Caja presencial</span>
          <h1>Turno de caja</h1>
        </div>
        <button
          className="button button--secondary"
          onClick={() => void cash.refresh()}
          disabled={cash.sending}
        >
          Actualizar caja
        </button>
      </header>
      <label className="cash-field">
        Código de caja
        <input
          disabled={!!s || cash.sending}
          value={register}
          onChange={(e) => setRegister(e.target.value.toUpperCase())}
        />
      </label>
      {cash.error ? <p role="alert">{cash.error}</p> : null}
      {feedback ? <p role="status">{feedback}</p> : null}
      {cash.loading ? <p role="status">Consultando turno…</p> : null}
      {!permitted ? (
        <p role="alert">No tienes permiso para administrar caja.</p>
      ) : null}
      {!cash.loading && !s && permitted ? (
        <section className="ops-work-panel">
          <h2>Apertura de caja</h2>
          <label className="cash-field">
            Fondo inicial
            <input
              inputMode="decimal"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
            />
          </label>
          <button
            className="button button--primary"
            disabled={
              cash.sending ||
              initial === null ||
              !/^[A-Z0-9_-]{1,32}$/.test(register)
            }
            onClick={() => {
              if (initial !== null) void cash.open(initial);
            }}
          >
            Confirmar apertura
          </button>
        </section>
      ) : null}
      {s ? (
        <>
          <p
            className={`cash-status cash-status--${s.status === "OPEN" ? "open" : "closed"}`}
          >
            {s.status === "OPEN"
              ? "Abierta"
              : s.status === "CLOSED"
                ? "Cerrada"
                : "En cierre"}{" "}
            · Versión {s.rowVersion}
          </p>
          <section className="cash-summary" aria-label="Resumen de caja">
            {Object.entries({
              Apertura: s.breakdown.opening,
              Ventas: s.breakdown.sales,
              Propinas: s.breakdown.tips,
              "Otros ingresos": s.breakdown.otherIncome,
              Gastos: s.breakdown.expenses,
              Retiros: s.breakdown.withdrawals,
              "Efectivo esperado": s.expectedCash,
              ...(s.countedCash !== undefined
                ? {
                    "Efectivo contado": s.countedCash,
                    Diferencia: s.difference ?? 0,
                  }
                : {}),
            }).map(([name, value]) => (
              <div className="cash-summary__item" key={name}>
                <span>{name}</span>
                <strong>{formatMoney(value, s.currency)}</strong>
              </div>
            ))}
          </section>
          <section className="cash-movements">
            <h2>Movimientos persistidos</h2>
            {s.movements.map((m) => (
              <div className="cash-movement-row" key={m.id}>
                <div className="cash-movement__info">
                  <strong>{m.type}</strong>
                  <span>{m.reason}</span>
                </div>
                <strong>{formatMoney(m.amountDelta, s.currency)}</strong>
                <span>{new Date(m.occurredAt).toLocaleString("es-GT")}</span>
              </div>
            ))}
          </section>
          {s.status === "OPEN" && permitted ? (
            <button
              className="button button--danger"
              disabled={cash.sending || !!cash.error}
              onClick={() => {
                if (!sameTurn)
                  setCount({
                    sessionId: s.id,
                    version: s.rowVersion,
                    amount: "",
                  });
                setCounting(true);
              }}
            >
              Iniciar conteo de cierre
            </button>
          ) : null}
          {s.status === "CLOSED" && permitted ? (
            <button
              className="button button--secondary"
              disabled={cash.sending}
              onClick={() => {
                setCount(null);
                setCounting(false);
                cash.newTurn();
              }}
            >
              Consultar nuevo turno
            </button>
          ) : null}
        </>
      ) : null}
      {counting && sameTurn ? (
        <div className="confirm-dialog__backdrop">
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            onKeyDown={(e) =>
              containDialogKeys(e, () => {
                if (!cash.sending) setCounting(false);
              })
            }
            aria-labelledby="cash-count-title"
          >
            <h2 id="cash-count-title">Conteo y cierre de caja</h2>
            <p>
              Conteo iniciado con versión {version}. Versión actual:{" "}
              {s?.rowVersion}.
            </p>
            <p>
              Esperado actual: {formatMoney(s?.expectedCash, s?.currency)}. Los
              cobros continúan hasta que el servidor confirma el cierre.
            </p>
            <label className="cash-field">
              Efectivo contado
              <input
                autoFocus
                inputMode="decimal"
                value={count.amount}
                onChange={(e) => setCount({ ...count, amount: e.target.value })}
              />
            </label>
            {stale ? (
              <div role="alert">
                <strong>La caja cambió. Debes revisar y recontar.</strong>
                <p>
                  Conservamos el conteo introducido; no lo usaremos con una
                  versión nueva.
                </p>
                <button
                  className="button button--secondary"
                  disabled={cash.sending || s?.status !== "OPEN"}
                  onClick={() => {
                    if (s) {
                      setCount({
                        sessionId: s.id,
                        version: s.rowVersion,
                        amount: "",
                      });
                      void cash.refresh();
                    }
                  }}
                >
                  Revisar e iniciar un nuevo conteo
                </button>
              </div>
            ) : null}
            {cash.error ? <p role="alert">{cash.error}</p> : null}
            <div className="confirm-dialog__actions">
              <button
                className="button button--secondary"
                disabled={cash.sending}
                onClick={() => setCounting(false)}
              >
                Volver sin cerrar
              </button>
              <button
                className="button button--danger"
                disabled={
                  cash.sending ||
                  stale ||
                  counted === null ||
                  s?.status !== "OPEN" ||
                  !!cash.error
                }
                onClick={() => void close()}
              >
                Confirmar cierre
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function containDialogKeys(
  event: React.KeyboardEvent<HTMLElement>,
  close: () => void,
) {
  if (event.key === "Escape") {
    event.preventDefault();
    close();
    return;
  }
  if (event.key !== "Tab") return;
  const controls = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      "button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]",
    ),
  );
  const first = controls[0],
    last = controls[controls.length - 1];
  if (!first || !last) {
    event.preventDefault();
    return;
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
