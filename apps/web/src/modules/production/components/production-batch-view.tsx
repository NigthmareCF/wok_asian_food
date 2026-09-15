"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Beaker,
  CheckCircle2,
  Clock3,
  Edit3,
  Timer,
  X,
} from "lucide-react";
import {
  productionStatusMeta,
  getProductionMovements,
} from "@/data/fixtures/production";
import { useProductionSession } from "../production-session-provider";

export function ProductionBatchView({ batchId }: { batchId: string }) {
  const { batches, completeBatch, discardBatch } = useProductionSession();
  const batch = batches.find((b) => b.id === batchId);
  const [showComplete, setShowComplete] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const [actualQty, setActualQty] = useState("");
  const [completeNotes, setCompleteNotes] = useState("");
  const [discardReason, setDiscardReason] = useState("");
  const [feedback, setFeedback] = useState("");

  if (!batch) {
    return (
      <div className="production-page">
        <Link className="text-action" href="/operation/production">
          <ArrowLeft aria-hidden="true" size={16} /> Volver a producción
        </Link>
        <div className="ops-empty-state order-not-found">
          <strong>Este batch no está disponible</strong>
          <span>Puede haberse reiniciado al recargar los datos simulados.</span>
        </div>
      </div>
    );
  }

  const status = productionStatusMeta[batch.status];
  const movements = getProductionMovements(batch.id);
  const isActive = batch.status === "active";
  const isEditable = batch.status === "active" || batch.status === "resting";

  const handleComplete = () => {
    const qty = Number(actualQty);
    if (!qty || qty <= 0) return;
    const result = completeBatch({
      batchId: batch.id,
      quantityActual: qty,
      notes: completeNotes || undefined,
    });
    if (result) {
      const percent =
        batch.quantityExpected > 0
          ? Math.round((qty / batch.quantityExpected) * 1000) / 10
          : 0;
      setFeedback(
        `Batch completado: ${qty} ${batch.unit} (${percent}% rendimiento).`,
      );
      setShowComplete(false);
      setActualQty("");
      setCompleteNotes("");
    }
  };

  const handleDiscard = () => {
    if (!discardReason.trim()) return;
    const result = discardBatch({ batchId: batch.id, reason: discardReason });
    if (result) {
      setFeedback("Batch descartado. No se libera stock de este lote.");
      setShowDiscard(false);
      setDiscardReason("");
    }
  };

  return (
    <div className="production-page production-detail">
      <header className="ops-page-header production-page__header">
        <div>
          <Link className="text-action" href="/operation/production">
            <ArrowLeft aria-hidden="true" size={16} /> Volver a producción
          </Link>
          <span className="ops-kicker">Detalle de batch</span>
          <h1>{batch.recipeName}</h1>
          <p>
            {batch.category} · {batch.id}
          </p>
        </div>
        <span
          className={`production-status production-status--${status.tone} production-status--large`}
        >
          {status.label}
        </span>
      </header>

      {feedback && (
        <div className="ops-inline-feedback" role="status">
          <CheckCircle2 aria-hidden="true" size={18} /> {feedback}
        </div>
      )}

      <section className="production-state-strip">
        <Beaker aria-hidden="true" size={21} />
        <div>
          <strong>{status.label}</strong>
          <span>{status.description}</span>
        </div>
        <strong>
          {batch.quantityActual || "—"} / {batch.quantityExpected} {batch.unit}
        </strong>
      </section>

      <section className="production-detail__summary" aria-label="Resumen del batch">
        <div>
          <span>Inicio</span>
          <strong>{batch.startedAt || "Esperando"}</strong>
        </div>
        <div>
          <span>Responsable</span>
          <strong>{batch.responsible}</strong>
        </div>
        <div>
          <span>Rendimiento</span>
          <strong
            className={
              batch.yieldPercent > 0 && batch.yieldPercent < 85
                ? "text-warning"
                : batch.yieldPercent > 0
                  ? "text-success"
                  : ""
            }
          >
            {batch.yieldPercent > 0 ? `${batch.yieldPercent}%` : "—"}
          </strong>
        </div>
        <div>
          <span>Estado de pago</span>
          <strong>
            {batch.status === "discarded"
              ? "No libera stock"
              : batch.status === "completed"
                ? "Libera stock"
                : "En proceso"}
          </strong>
        </div>
      </section>

      {batch.restingUntil && (
        <section className="production-resting-strip">
          <Clock3 aria-hidden="true" size={18} />
          <div>
            <span>Reposo</span>
            <strong>Hasta {batch.restingUntil}</strong>
          </div>
        </section>
      )}

      <div className="production-detail__layout">
        <section
          className="production-detail__movements"
          aria-labelledby="movements-title"
        >
          <div className="ops-section-heading">
            <div>
              <h2 id="movements-title">Trazabilidad</h2>
              <p>Movimientos registrados del batch</p>
            </div>
          </div>
          <div className="production-movement-list">
            {movements.length > 0 ? (
              movements.map((m) => (
                <div className="production-movement" key={m.id}>
                  <span className="production-movement__time">{m.createdAt}</span>
                  <div>
                    <strong>
                      {m.type === "start"
                        ? "Inicio de producción"
                        : m.type === "complete"
                          ? `Completado (${m.quantity} unidades)`
                          : m.type === "discard"
                            ? "Descartado"
                            : m.type === "pause"
                              ? "En pausa"
                              : m.type === "resume"
                                ? "Reanudado"
                                : "Ajuste"}
                    </strong>
                    {m.note && <span>{m.note}</span>}
                    <small>Por {m.createdBy}</small>
                  </div>
                </div>
              ))
            ) : (
              <div className="ops-empty-state">
                <strong>Sin movimientos registrados</strong>
                <span>Usa los botones de abajo para gestionar este batch.</span>
              </div>
            )}
          </div>

          {batch.notes && (
            <div className="production-notes">
              <AlertTriangle aria-hidden="true" size={16} />
              <span>{batch.notes}</span>
            </div>
          )}

          {batch.discardReason && (
            <div className="production-notes production-notes--danger">
              <AlertTriangle aria-hidden="true" size={16} />
              <span>Motivo: {batch.discardReason}</span>
            </div>
          )}
        </section>

        <aside
          className="production-actions"
          aria-labelledby="production-actions-title"
        >
          <div>
            <span>Acciones</span>
            <h2 id="production-actions-title">Gestionar batch</h2>
          </div>

          {isEditable && (
            <button
              className="button button--primary button--full"
              onClick={() => setShowComplete(true)}
              type="button"
            >
              <CheckCircle2 aria-hidden="true" size={18} /> Completar producción
            </button>
          )}

          {isEditable && (
            <button
              className="button button--danger button--full"
              onClick={() => setShowDiscard(true)}
              type="button"
            >
              <X aria-hidden="true" size={18} /> Descartar batch
            </button>
          )}

          {!isEditable && (
            <p className="production-actions__hint">
              Este batch ya fue {batch.status === "completed" ? "completado" : "descartado"} y no admite más acciones.
            </p>
          )}

          <div className="production-trace">
            <strong>Resumen</strong>
            <span>
              Esperado: {batch.quantityExpected} {batch.unit}
            </span>
            <span>
              Realizado: {batch.quantityActual || "—"} {batch.unit}
            </span>
            {batch.yieldPercent > 0 && (
              <span
                className={
                  batch.yieldPercent < 85
                    ? "text-warning"
                    : batch.yieldPercent >= 95
                      ? "text-success"
                      : "text-warning"
                }
              >
                Rendimiento: {batch.yieldPercent}%
              </span>
            )}
          </div>
        </aside>
      </div>

      <p className="mock-disclaimer">
        Los datos de producción son simulados; se reinician al recargar.
      </p>

      {showComplete && (
        <div className="confirm-dialog__backdrop" role="presentation">
          <section
            aria-labelledby="complete-title"
            aria-modal="true"
            className="confirm-dialog"
            role="dialog"
          >
            <button
              aria-label="Cerrar"
              className="icon-button confirm-dialog__close"
              onClick={() => setShowComplete(false)}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
            <span className="confirm-dialog__icon">
              <Timer aria-hidden="true" size={22} />
            </span>
            <h2 id="complete-title">Completar producción</h2>
            <p>
              Esperado: <strong>{batch.quantityExpected} {batch.unit}</strong>
            </p>
            <label className="cash-field">
              <span>Cantidad real producida ({batch.unit})</span>
              <input
                min={0.01}
                onChange={(e) => setActualQty(e.target.value)}
                placeholder={String(batch.quantityExpected)}
                step="0.01"
                type="number"
                value={actualQty}
              />
            </label>
            <label className="cash-field">
              <span>Notas (opcional)</span>
              <input
                onChange={(e) => setCompleteNotes(e.target.value)}
                placeholder="Observaciones del lote"
                type="text"
                value={completeNotes}
              />
            </label>
            <div className="confirm-dialog__actions">
              <button
                className="button button--secondary"
                onClick={() => setShowComplete(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="button button--primary"
                disabled={!actualQty || Number(actualQty) <= 0}
                onClick={handleComplete}
                type="button"
              >
                Confirmar completado
              </button>
            </div>
          </section>
        </div>
      )}

      {showDiscard && (
        <div className="confirm-dialog__backdrop" role="presentation">
          <section
            aria-labelledby="discard-title"
            aria-modal="true"
            className="confirm-dialog"
            role="dialog"
          >
            <button
              aria-label="Cerrar"
              className="icon-button confirm-dialog__close"
              onClick={() => setShowDiscard(false)}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
            <span className="confirm-dialog__icon confirm-dialog__icon--danger">
              <X aria-hidden="true" size={22} />
            </span>
            <h2 id="discard-title">Descartar batch</h2>
            <p>
              Esta acción no se puede deshacer. El stock del lote no se liberará.
            </p>
            <label className="cash-field">
              <span>Motivo del descarte</span>
              <input
                onChange={(e) => setDiscardReason(e.target.value)}
                placeholder="Ej. Contaminación, error de receta..."
                type="text"
                value={discardReason}
              />
            </label>
            <div className="confirm-dialog__actions">
              <button
                className="button button--secondary"
                onClick={() => setShowDiscard(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="button button--danger"
                disabled={!discardReason.trim()}
                onClick={handleDiscard}
                type="button"
              >
                Confirmar descarte
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}