"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  MinusCircle,
  Plus,
  PlusCircle,
  Trash2,
  X,
} from "lucide-react";
import {
  initialCashSession,
  cashCategories,
  formatGTQ,
  getCashSummary,
  type CashMovementType,
  type CashMovement,
  type CashSession,
} from "@/data/fixtures/cash";
import { useCashSession } from "../cash-session-provider";

const typeMeta: Record<
  CashMovementType,
  { label: string; Icon: typeof PlusCircle; tone: "success" | "danger" | "warning" | "info" }
> = {
  income: { label: "Ingreso", Icon: PlusCircle, tone: "success" },
  expense: { label: "Gasto", Icon: MinusCircle, tone: "danger" },
  withdrawal: { label: "Retiro", Icon: MinusCircle, tone: "warning" },
  deposit: { label: "Depósito", Icon: PlusCircle, tone: "info" },
};

const statusMeta: Record<
  CashMovement["status"],
  { label: string; tone: "success" | "warning" | "danger" }
> = {
  confirmed: { label: "Confirmado", tone: "success" },
  pending: { label: "Pendiente", tone: "warning" },
  cancelled: { label: "Cancelado", tone: "danger" },
};

export function CashView() {
  const { session, addMovement, updateMovementStatus, closeCash } = useCashSession();
  const summary = getCashSummary(session);
  const [showAddMovement, setShowAddMovement] = useState(false);
  const [showCloseCash, setShowCloseCash] = useState(false);
  const [movementType, setMovementType] = useState<CashMovementType>("income");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementDescription, setMovementDescription] = useState("");
  const [movementCategory, setMovementCategory] = useState("");
  const [movementReference, setMovementReference] = useState("");
  const [countedAmount, setCountedAmount] = useState("");
  const [closingNotes, setClosingNotes] = useState("");
  const [feedback, setFeedback] = useState("");

  const availableCategories = cashCategories[movementType] ?? [];

  const handleAddMovement = () => {
    const amount = Number(movementAmount);
    if (!amount || amount <= 0 || !movementDescription || !movementCategory) return;

    const result = addMovement({
      type: movementType,
      amount,
      description: movementDescription,
      category: movementCategory,
      reference: movementReference || undefined,
    });

    if (result) {
      const typeLabel = typeMeta[movementType].label;
      setFeedback(`${typeLabel} de ${formatGTQ(amount)} registrado.`);
      setShowAddMovement(false);
      setMovementAmount("");
      setMovementDescription("");
      setMovementCategory("");
      setMovementReference("");
    }
  };

  const handleCloseCash = () => {
    const amount = Number(countedAmount);
    if (amount < 0) return;

    const result = closeCash({ countedAmount: amount, notes: closingNotes || undefined });
    if (result) {
      const diff = amount - summary.expectedCash;
      setFeedback(
        `Cierre de caja ejecutado. Efectivo contado: ${formatGTQ(amount)}. ` +
          (diff === 0
            ? "Cuadre perfecto."
            : diff > 0
            ? `Sobrante de ${formatGTQ(diff)}.`
            : `Faltante de ${formatGTQ(Math.abs(diff))}.`),
      );
      setShowCloseCash(false);
      setCountedAmount("");
      setClosingNotes("");
    }
  };

  return (
    <div className="cash-page">
      <header className="ops-page-header cash-page__header">
        <div>
          <Link className="text-action" href="/operation">
            <ArrowLeft aria-hidden="true" size={16} /> Volver a operación
          </Link>
          <span className="ops-kicker">Caja · {session.date}</span>
          <h1>Control de caja</h1>
          <p>Turno abierto por {session.openedBy} a las {session.openedAt}</p>
        </div>
        <span className={`cash-status cash-status--${session.status === "open" ? "open" : "closed"}`}>
          {session.status === "open" ? "Abierta" : "Cerrada"}
        </span>
      </header>

      {feedback ? (
        <div className="ops-inline-feedback" role="status">
          <CheckCircle2 aria-hidden="true" size={18} /> {feedback}
        </div>
      ) : null}

      <section className="cash-summary" aria-label="Resumen de caja">
        <div className="cash-summary__item">
          <span>Fondo inicial</span>
          <strong>{formatGTQ(session.initialAmount)}</strong>
        </div>
        <div className="cash-summary__item cash-summary__item--income">
          <span>Ingresos</span>
          <strong className="text-success">+ {formatGTQ(summary.totalIncome)}</strong>
        </div>
        <div className="cash-summary__item cash-summary__item--expense">
          <span>Gastos</span>
          <strong className="text-danger">- {formatGTQ(summary.totalExpenses)}</strong>
        </div>
        <div className="cash-summary__item cash-summary__item--withdrawal">
          <span>Retiros</span>
          <strong className="text-warning">- {formatGTQ(summary.totalWithdrawals)}</strong>
        </div>
        <div className="cash-summary__item cash-summary__item--deposit">
          <span>Depósitos</span>
          <strong className="text-info">+ {formatGTQ(summary.totalDeposits)}</strong>
        </div>
        <div className="cash-summary__item cash-summary__item--expected">
          <span>Esperado en caja</span>
          <strong>{formatGTQ(summary.expectedCash)}</strong>
        </div>
        <div className="cash-summary__item cash-summary__item--current">
          <span>Efectivo actual</span>
          <strong>{formatGTQ(session.currentAmount)}</strong>
        </div>
        <div
          className={`cash-summary__item cash-summary__item--difference ${
            summary.difference === 0
              ? "cash-summary__item--ok"
              : summary.difference > 0
              ? "cash-summary__item--positive"
              : "cash-summary__item--negative"
          }`}
        >
          <span>Diferencia</span>
          <strong className={summary.difference === 0 ? "text-success" : summary.difference > 0 ? "text-warning" : "text-danger"}>
            {summary.difference >= 0 ? "+" : ""}{formatGTQ(summary.difference)}
          </strong>
        </div>
      </section>

      {session.status === "open" && (
        <div className="cash-actions-bar">
          <button
            className="button button--primary"
            onClick={() => {
              setMovementType("income");
              setMovementCategory(availableCategories[0]);
              setShowAddMovement(true);
            }}
            type="button"
          >
            <Plus aria-hidden="true" size={17} /> Registrar ingreso
          </button>
          <button
            className="button button--secondary"
            onClick={() => {
              setMovementType("expense");
              setMovementCategory(cashCategories.expense[0]);
              setShowAddMovement(true);
            }}
            type="button"
          >
            <MinusCircle aria-hidden="true" size={17} /> Registrar gasto
          </button>
          <button
            className="button button--secondary"
            onClick={() => {
              setMovementType("withdrawal");
              setMovementCategory(cashCategories.withdrawal[0]);
              setShowAddMovement(true);
            }}
            type="button"
          >
            <MinusCircle aria-hidden="true" size={17} /> Registrar retiro
          </button>
          <button
            className="button button--secondary"
            onClick={() => {
              setMovementType("deposit");
              setMovementCategory(cashCategories.deposit[0]);
              setShowAddMovement(true);
            }}
            type="button"
          >
            <PlusCircle aria-hidden="true" size={17} /> Registrar depósito
          </button>
          <button
            className="button button--danger"
            onClick={() => setShowCloseCash(true)}
            type="button"
          >
            <X aria-hidden="true" size={17} /> Cerrar caja
          </button>
        </div>
      )}

      <section
        className="cash-movements"
        aria-labelledby="movements-title"
      >
        <div className="ops-section-heading">
          <div>
            <h2 id="movements-title">Movimientos del turno</h2>
            <p>{session.movements.length} registros</p>
          </div>
        </div>

        <div className="cash-movements-list">
          {session.movements.length > 0 ? (
            session.movements
              .slice()
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((movement) => {
                const meta = typeMeta[movement.type];
                const status = statusMeta[movement.status];
                const Icon = meta.Icon;
                return (
                  <div className="cash-movement-row" key={movement.id}>
                    <div className={`cash-movement__type cash-movement__type--${meta.tone}`}>
                      <Icon aria-hidden="true" size={18} />
                      <span>{meta.label}</span>
                    </div>
                    <div className="cash-movement__info">
                      <strong>{movement.description}</strong>
                      <span>{movement.category}</span>
                    </div>
                    <div className={`cash-movement__amount cash-movement__amount--${meta.tone}`}>
                      {meta.tone === "success" || meta.tone === "info" ? "+" : "-"}
                      {formatGTQ(movement.amount)}
                    </div>
                    <div className="cash-movement__meta">
                      <span>{movement.createdAt}</span>
                      <span>{movement.createdBy}</span>
                    </div>
                    <span className={`movement-status movement-status--${status.tone}`}>
                      {status.label}
                    </span>
                    {movement.status === "pending" && (
                      <button
                        className="icon-button icon-button--quiet"
                        onClick={() => updateMovementStatus(movement.id, "confirmed")}
                        type="button"
                      >
                        <CheckCircle2 aria-hidden="true" size={17} />
                      </button>
                    )}
                  </div>
                );
              })
          ) : (
            <div className="ops-empty-state">
              <strong>No hay movimientos registrados</strong>
              <span>Usa los botones de arriba para agregar el primer movimiento.</span>
            </div>
          )}
        </div>
      </section>

      <p className="mock-disclaimer">
        Los movimientos y montos son simulados; se reinician al recargar.
      </p>

      {showAddMovement ? (
        <div className="confirm-dialog__backdrop" role="presentation">
          <section
            aria-labelledby="add-movement-title"
            aria-modal="true"
            className="confirm-dialog"
            role="dialog"
          >
            <button
              aria-label="Cerrar movimiento"
              className="icon-button confirm-dialog__close"
              onClick={() => setShowAddMovement(false)}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
            <span className="confirm-dialog__icon">
              {(() => {
                const Icon = typeMeta[movementType].Icon;
                return <Icon aria-hidden="true" size={22} />;
              })()}
            </span>
            <h2 id="add-movement-title">
              {typeMeta[movementType].label === "Ingreso" || typeMeta[movementType].label === "Depósito"
                ? "Registrar ingreso"
                : "Registrar salida"}
            </h2>
            <p>Tipo: <strong>{typeMeta[movementType].label}</strong></p>

            <label className="cash-field">
              <span>Tipo</span>
              <select
                value={movementType}
                onChange={(e) => {
                  const newType = e.target.value as CashMovementType;
                  setMovementType(newType);
                  setMovementCategory(cashCategories[newType][0]);
                }}
              >
                <option value="income">Ingreso</option>
                <option value="expense">Gasto</option>
                <option value="withdrawal">Retiro</option>
                <option value="deposit">Depósito</option>
              </select>
            </label>

            <label className="cash-field">
              <span>Categoría</span>
              <select
                value={movementCategory}
                onChange={(e) => setMovementCategory(e.target.value)}
              >
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </label>

            <label className="cash-field">
              <span>Descripción</span>
              <input
                type="text"
                value={movementDescription}
                onChange={(e) => setMovementDescription(e.target.value)}
                placeholder="Ej. Cobro Mesa 5"
              />
            </label>

            <label className="cash-field">
              <span>Monto</span>
              <input
                type="number"
                step="0.01"
                min={0.01}
                value={movementAmount}
                onChange={(e) => setMovementAmount(e.target.value)}
                placeholder="0.00"
              />
            </label>

            <label className="cash-field">
              <span>Referencia (opcional)</span>
              <input
                type="text"
                value={movementReference}
                onChange={(e) => setMovementReference(e.target.value)}
                placeholder="A-105, D-089, factura #123"
              />
            </label>

            <div className="confirm-dialog__actions">
              <button
                className="button button--secondary"
                onClick={() => setShowAddMovement(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="button button--primary"
                disabled={
                  !movementAmount ||
                  Number(movementAmount) <= 0 ||
                  !movementDescription ||
                  !movementCategory
                }
                onClick={handleAddMovement}
                type="button"
              >
                Confirmar registro
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {showCloseCash ? (
        <div className="confirm-dialog__backdrop" role="presentation">
          <section
            aria-labelledby="close-cash-title"
            aria-modal="true"
            className="confirm-dialog"
            role="dialog"
          >
            <button
              aria-label="Cerrar cierre"
              className="icon-button confirm-dialog__close"
              onClick={() => setShowCloseCash(false)}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
            <span className="confirm-dialog__icon confirm-dialog__icon--warning">
              <Clock3 aria-hidden="true" size={22} />
            </span>
            <h2 id="close-cash-title">Cerrar caja</h2>
            <p>
              Efectivo esperado: <strong>{formatGTQ(summary.expectedCash)}</strong>
            </p>
            <p>
              Diferencia actual: <strong className={summary.difference === 0 ? "text-success" : summary.difference > 0 ? "text-warning" : "text-danger"}>
                {summary.difference >= 0 ? "+" : ""}{formatGTQ(summary.difference)}
              </strong>
            </p>

            <label className="cash-field">
              <span>Efectivo contado físicamente</span>
              <input
                type="number"
                step="0.01"
                min={0}
                value={countedAmount}
                onChange={(e) => setCountedAmount(e.target.value)}
                placeholder={formatGTQ(summary.expectedCash)}
              />
            </label>

            <label className="cash-field">
              <span>Observaciones (opcional)</span>
              <textarea
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
                placeholder="Ej. Diferencia por redondeo, billete roto, etc."
                rows={2}
              />
            </label>

            <div className="confirm-dialog__actions">
              <button
                className="button button--secondary"
                onClick={() => setShowCloseCash(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="button button--danger"
                disabled={countedAmount === "" || Number(countedAmount) < 0}
                onClick={handleCloseCash}
                type="button"
              >
                <X aria-hidden="true" size={17} /> Confirmar cierre
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}