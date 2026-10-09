"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useCashSession } from "../cash-session-provider";

const money = (value: number | null | undefined) =>
  new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(
    value ?? 0,
  );

export function CashView() {
  const {
    session,
    loading,
    error,
    actionLoading,
    openCash,
    addMovement,
    closeCash,
  } = useCashSession();
  const [openingFloat, setOpeningFloat] = useState("");
  const [movementType, setMovementType] = useState<
    "INCOME" | "EXPENSE" | "WITHDRAWAL"
  >("INCOME");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [feedback, setFeedback] = useState("");

  if (loading)
    return (
      <main className="cash-page" aria-busy="true">
        <p role="status">Cargando caja…</p>
      </main>
    );
  if (error && !session)
    return (
      <main className="cash-page">
        <p role="alert">{error}</p>
      </main>
    );

  const submitOpen = async (event: React.FormEvent) => {
    event.preventDefault();
    setFeedback("");
    if (await openCash(Number(openingFloat))) {
      setOpeningFloat("");
      setFeedback("Caja abierta correctamente.");
    }
  };
  const submitMovement = async (event: React.FormEvent) => {
    event.preventDefault();
    setFeedback("");
    if (await addMovement(movementType, Number(amount), reason)) {
      setAmount("");
      setReason("");
      setFeedback("Movimiento registrado correctamente.");
    }
  };
  const submitClose = async (event: React.FormEvent) => {
    event.preventDefault();
    setFeedback("");
    if (await closeCash(Number(countedCash))) {
      setCountedCash("");
      setFeedback("Cierre de caja ejecutado.");
    }
  };

  if (!session)
    return (
      <main className="cash-page">
        <header className="ops-page-header cash-page__header">
          <div>
            <Link className="text-action" href="/operation">
              <ArrowLeft size={16} aria-hidden="true" /> Volver a operación
            </Link>
            <h1>Control de caja</h1>
            <p>No hay una sesión abierta para la caja principal.</p>
          </div>
        </header>
        <form
          className="confirm-dialog"
          onSubmit={submitOpen}
          aria-labelledby="open-title"
        >
          <h2 id="open-title">Abrir caja</h2>
          <label className="cash-field">
            <span>Fondo de apertura</span>
            <input
              required
              min="0"
              step="0.01"
              type="number"
              value={openingFloat}
              onChange={(event) => setOpeningFloat(event.target.value)}
            />
          </label>
          <button
            className="button button--primary"
            disabled={actionLoading || openingFloat === ""}
            type="submit"
          >
            {actionLoading ? "Abriendo…" : "Abrir caja"}
          </button>
        </form>
        {error ? <p role="alert">{error}</p> : null}
      </main>
    );

  const breakdown = session.breakdown;
  return (
    <main className="cash-page">
      <header className="ops-page-header cash-page__header">
        <div>
          <Link className="text-action" href="/operation">
            <ArrowLeft size={16} aria-hidden="true" /> Volver a operación
          </Link>
          <span className="ops-kicker">Caja · {session.registerCode}</span>
          <h1>Control de caja</h1>
          <p>
            Sesión {session.id} · apertura{" "}
            {new Date(session.openedAt).toLocaleString("es-GT")}
          </p>
        </div>
        <span
          className={`cash-status cash-status--${session.status.toLowerCase()}`}
        >
          {session.status === "OPEN"
            ? "Abierta"
            : session.status === "CLOSED"
              ? "Cerrada"
              : "En cierre"}
        </span>
      </header>
      {feedback ? (
        <p className="ops-inline-feedback" role="status">
          {feedback}
        </p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      <section className="cash-summary" aria-label="Resumen de caja">
        {[
          ["Fondo de apertura", breakdown.opening],
          ["Ventas", breakdown.sales],
          ["Ingresos", breakdown.income],
          ["Gastos", -breakdown.expenses],
          ["Retiros", -breakdown.withdrawals],
          ["Saldo esperado", session.expectedCash],
        ].map(([label, value]) => (
          <div className="cash-summary__item" key={label as string}>
            <span>{label}</span>
            <strong>{money(Number(value))}</strong>
          </div>
        ))}
        {session.countedCash !== null ? (
          <div className="cash-summary__item">
            <span>Efectivo contado</span>
            <strong>{money(session.countedCash)}</strong>
          </div>
        ) : null}
        {session.difference !== null ? (
          <div className="cash-summary__item">
            <span>Diferencia</span>
            <strong>{money(session.difference)}</strong>
          </div>
        ) : null}
      </section>
      {session.status === "OPEN" ? (
        <>
          <form
            className="cash-actions-bar"
            onSubmit={submitMovement}
            aria-label="Registrar movimiento"
          >
            <select
              aria-label="Tipo de movimiento"
              value={movementType}
              onChange={(event) =>
                setMovementType(event.target.value as typeof movementType)
              }
            >
              <option value="INCOME">Ingreso</option>
              <option value="EXPENSE">Gasto</option>
              <option value="WITHDRAWAL">Retiro</option>
            </select>
            <input
              aria-label="Monto"
              required
              min="0.01"
              step="0.01"
              type="number"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="Monto"
            />
            <input
              aria-label="Motivo"
              required
              minLength={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Motivo"
            />
            <button
              className="button button--primary"
              disabled={actionLoading}
              type="submit"
            >
              {actionLoading ? "Guardando…" : "Registrar movimiento"}
            </button>
          </form>
          <form
            className="cash-actions-bar"
            onSubmit={submitClose}
            aria-label="Cerrar caja"
          >
            <input
              aria-label="Efectivo contado"
              required
              min="0"
              step="0.01"
              type="number"
              value={countedCash}
              onChange={(event) => setCountedCash(event.target.value)}
              placeholder="Efectivo contado"
            />
            <button
              className="button button--danger"
              disabled={actionLoading}
              type="submit"
            >
              {actionLoading ? "Cerrando…" : "Cerrar caja"}
            </button>
          </form>
        </>
      ) : null}
      <section className="cash-movements" aria-labelledby="movements-title">
        <h2 id="movements-title">Movimientos del turno</h2>
        {session.movements.length === 0 ? (
          <p>No hay movimientos registrados.</p>
        ) : (
          <div className="cash-movements-list">
            {session.movements.map((movement) => (
              <article className="cash-movement-row" key={movement.id}>
                <strong>{movement.movementType}</strong>
                <span>{movement.reason}</span>
                <span>{money(movement.amountDelta)}</span>
                <small>
                  {movement.responsibleUserId} ·{" "}
                  {new Date(movement.occurredAt).toLocaleString("es-GT")}
                </small>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
