"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Box,
  Calendar,
  CheckCircle2,
  Clock3,
  Edit3,
  Package,
  Plus,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import {
  inventoryStatusMeta,
  inventoryAdjustmentReasons,
  formatGTQ,
  type InventoryAdjustmentReason,
} from "@/data/fixtures/inventory";
import { useInventorySession } from "../inventory-session-provider";

const expiryReference = new Date("2026-09-11T06:00:00Z").getTime();

export function InventoryDetailView({ itemId }: { itemId: string }) {
  const { items, addEntry, adjustStock } = useInventorySession();
  const item = items.find((i) => i.id === itemId);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [entryQty, setEntryQty] = useState("");
  const [entryExpiry, setEntryExpiry] = useState("");
  const [entrySupplier, setEntrySupplier] = useState("");
  const [entryCost, setEntryCost] = useState("");
  const [entryBatch, setEntryBatch] = useState("");
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustReason, setAdjustReason] =
    useState<InventoryAdjustmentReason>("damage");
  const [adjustNotes, setAdjustNotes] = useState("");
  const [feedback, setFeedback] = useState("");

  if (!item) {
    return (
      <div className="inventory-page">
        <Link className="text-action" href="/operation/inventory">
          <ArrowLeft aria-hidden="true" size={16} /> Volver a inventario
        </Link>
        <div className="ops-empty-state order-not-found">
          <strong>Este insumo no está disponible</strong>
          <span>Puede haberse reiniciado al recargar los datos simulados.</span>
        </div>
      </div>
    );
  }

  const status = inventoryStatusMeta[item.status];
  const utilizationPercent =
    item.maxStock > 0 ? Math.round((item.stock / item.maxStock) * 100) : 0;
  const stockRatio =
    item.maxStock > 0 ? (item.stock / item.maxStock) * 100 : 0;

  const handleAddEntry = () => {
    const qty = Number(entryQty);
    const cost = Number(entryCost);
    if (!qty || qty <= 0 || !entryExpiry || !entrySupplier) return;
    const result = addEntry({
      itemId: item.id,
      quantity: qty,
      expiryDate: entryExpiry,
      supplier: entrySupplier,
      cost: cost || 0,
      batchCode: entryBatch || undefined,
    });
    if (result) {
      setFeedback(`Entrada de ${qty} ${item.unit} registrada.`);
      setShowAddEntry(false);
      setEntryQty("");
      setEntryExpiry("");
      setEntrySupplier("");
      setEntryCost("");
      setEntryBatch("");
    }
  };

  const handleAdjust = () => {
    const qty = Number(adjustQty);
    if (!qty) return;
    const result = adjustStock({
      itemId: item.id,
      quantity: qty,
      reason: adjustReason,
      notes: adjustNotes || undefined,
    });
    if (result) {
      const label =
        inventoryAdjustmentReasons.find((r) => r.value === adjustReason)
          ?.label || adjustReason;
      setFeedback(
        `Ajuste de ${qty > 0 ? "+" : ""}${qty} ${item.unit} registrado (${label}).`,
      );
      setShowAdjust(false);
      setAdjustQty("");
      setAdjustNotes("");
    }
  };

  return (
    <div className="inventory-page inventory-detail">
      <header className="ops-page-header inventory-page__header">
        <div>
          <Link className="text-action" href="/operation/inventory">
            <ArrowLeft aria-hidden="true" size={16} /> Volver a inventario
          </Link>
          <span className="ops-kicker">Detalle de insumo</span>
          <h1>{item.name}</h1>
          <p>
            {item.category} · ID {item.id}
          </p>
        </div>
        <span
          className={`inventory-status inventory-status--${status.tone} inventory-status--large`}
        >
          {status.label}
        </span>
      </header>

      {feedback && (
        <div className="ops-inline-feedback" role="status">
          <CheckCircle2 aria-hidden="true" size={18} /> {feedback}
        </div>
      )}

      <section className="inventory-state-strip">
        <Box aria-hidden="true" size={21} />
        <div>
          <strong>{status.label}</strong>
          <span>{status.description}</span>
        </div>
        <strong>
          {item.stock} {item.unit}
        </strong>
      </section>

      <section className="inventory-detail__summary" aria-label="Resumen del insumo">
        <div>
          <span>Stock actual</span>
          <strong>
            {item.stock} {item.unit}
          </strong>
        </div>
        <div>
          <span>Disponible</span>
          <strong className="text-success">
            {item.available} {item.unit}
          </strong>
        </div>
        <div>
          <span>Reservado</span>
          <strong className="text-warning">
            {item.reserved} {item.unit}
          </strong>
        </div>
        <div>
          <span>Lotes</span>
          <strong>{item.lots.length}</strong>
        </div>
      </section>

      <section className="inventory-stock-bar" aria-label="Nivel de stock">
        <div className="inventory-stock-bar__header">
          <span>Nivel de stock</span>
          <strong>{utilizationPercent}%</strong>
        </div>
        <div className="inventory-stock-bar__track">
          <div
            className="inventory-stock-bar__fill"
            style={{ width: `${Math.min(stockRatio, 100)}%` }}
          />
          <div
            className="inventory-stock-bar__min"
            style={{
              left: `${(item.minStock / item.maxStock) * 100}%`,
            }}
          />
        </div>
        <div className="inventory-stock-bar__labels">
          <span>0</span>
          <span>Mín: {item.minStock}</span>
          <span>Máx: {item.maxStock}</span>
        </div>
      </section>

      <div className="inventory-actions-bar">
        <button
          className="button button--primary"
          onClick={() => setShowAddEntry(true)}
          type="button"
        >
          <Plus aria-hidden="true" size={17} /> Registrar entrada
        </button>
        <button
          className="button button--secondary"
          onClick={() => {
            setAdjustQty("");
            setShowAdjust(true);
          }}
          type="button"
        >
          <Edit3 aria-hidden="true" size={17} /> Ajustar stock
        </button>
      </div>

      <div className="inventory-detail__layout">
        <section
          className="inventory-detail__lots"
          aria-labelledby="lots-title"
        >
          <div className="ops-section-heading">
            <div>
              <h2 id="lots-title">Lotes</h2>
              <p>Historial de entradas y vigencia</p>
            </div>
          </div>
          <div className="inventory-lot-list">
            {item.lots.map((lot) => {
              const daysUntilExpiry = Math.ceil(
                (new Date(lot.expiryDate).getTime() - expiryReference) /
                  (1000 * 60 * 60 * 24),
              );
              const isExpiring = daysUntilExpiry <= 30 && daysUntilExpiry > 0;
              const isExpired = daysUntilExpiry <= 0;
              return (
                <div
                  className={`inventory-lot ${isExpired ? "inventory-lot--expired" : isExpiring ? "inventory-lot--expiring" : ""}`}
                  key={lot.id}
                >
                  <div className="inventory-lot__header">
                    <strong>{lot.batchCode || lot.id}</strong>
                    <span>
                      {lot.quantity} {item.unit}
                    </span>
                  </div>
                  <div className="inventory-lot__details">
                    <div>
                      <span>Entrada</span>
                      <strong>{lot.entryDate}</strong>
                    </div>
                    <div>
                      <span>Vencimiento</span>
                      <strong
                        className={
                          isExpired
                            ? "text-danger"
                            : isExpiring
                              ? "text-warning"
                              : ""
                        }
                      >
                        {lot.expiryDate}
                        {isExpired
                          ? " (Vencido)"
                          : isExpiring
                            ? ` (${daysUntilExpiry} días)`
                            : ""}
                      </strong>
                    </div>
                    <div>
                      <span>Proveedor</span>
                      <strong>{lot.supplier}</strong>
                    </div>
                    <div>
                      <span>Costo</span>
                      <strong>{formatGTQ(lot.cost)}</strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="inventory-detail__side" aria-labelledby="detail-side-title">
          <div>
            <span>Información</span>
            <h2 id="detail-side-title">Datos del insumo</h2>
          </div>
          <div className="inventory-info-card">
            <div>
              <span>Unidad</span>
              <strong>{item.unit}</strong>
            </div>
            <div>
              <span>Categoría</span>
              <strong>{item.category}</strong>
            </div>
            <div>
              <span>Última entrada</span>
              <strong>{item.lastEntry || "—"}</strong>
            </div>
            <div>
              <span>Último ajuste</span>
              <strong>{item.lastAdjustment || "—"}</strong>
            </div>
          </div>
        </aside>
      </div>

      <p className="mock-disclaimer">
        Los datos de inventario son simulados; se reinician al recargar.
      </p>

      {showAddEntry && (
        <div className="confirm-dialog__backdrop" role="presentation">
          <section
            aria-labelledby="add-entry-title"
            aria-modal="true"
            className="confirm-dialog"
            role="dialog"
          >
            <button
              aria-label="Cerrar"
              className="icon-button confirm-dialog__close"
              onClick={() => setShowAddEntry(false)}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
            <span className="confirm-dialog__icon">
              <Package aria-hidden="true" size={22} />
            </span>
            <h2 id="add-entry-title">Registrar entrada</h2>
            <p>
              Insumo: <strong>{item.name}</strong> · Stock actual:{" "}
              <strong>
                {item.stock} {item.unit}
              </strong>
            </p>
            <label className="cash-field">
              <span>Cantidad ({item.unit})</span>
              <input
                min={0.01}
                onChange={(e) => setEntryQty(e.target.value)}
                placeholder="0"
                step="0.01"
                type="number"
                value={entryQty}
              />
            </label>
            <label className="cash-field">
              <span>Fecha de vencimiento</span>
              <input
                onChange={(e) => setEntryExpiry(e.target.value)}
                type="date"
                value={entryExpiry}
              />
            </label>
            <label className="cash-field">
              <span>Proveedor</span>
              <input
                onChange={(e) => setEntrySupplier(e.target.value)}
                placeholder="Nombre del proveedor"
                type="text"
                value={entrySupplier}
              />
            </label>
            <label className="cash-field">
              <span>Costo unitario (GTQ)</span>
              <input
                min={0}
                onChange={(e) => setEntryCost(e.target.value)}
                placeholder="0.00"
                step="0.01"
                type="number"
                value={entryCost}
              />
            </label>
            <label className="cash-field">
              <span>Código de lote (opcional)</span>
              <input
                onChange={(e) => setEntryBatch(e.target.value)}
                placeholder="LOTE-001"
                type="text"
                value={entryBatch}
              />
            </label>
            <div className="confirm-dialog__actions">
              <button
                className="button button--secondary"
                onClick={() => setShowAddEntry(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="button button--primary"
                disabled={
                  !entryQty ||
                  Number(entryQty) <= 0 ||
                  !entryExpiry ||
                  !entrySupplier
                }
                onClick={handleAddEntry}
                type="button"
              >
                Confirmar entrada
              </button>
            </div>
          </section>
        </div>
      )}

      {showAdjust && (
        <div className="confirm-dialog__backdrop" role="presentation">
          <section
            aria-labelledby="adjust-title"
            aria-modal="true"
            className="confirm-dialog"
            role="dialog"
          >
            <button
              aria-label="Cerrar"
              className="icon-button confirm-dialog__close"
              onClick={() => setShowAdjust(false)}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
            <span className="confirm-dialog__icon confirm-dialog__icon--warning">
              <Edit3 aria-hidden="true" size={22} />
            </span>
            <h2 id="adjust-title">Ajustar stock</h2>
            <p>
              Stock actual: <strong>{item.stock} {item.unit}</strong>
            </p>
            <label className="cash-field">
              <span>
                Cantidad (+ para agregar, - para restar)
              </span>
              <input
                onChange={(e) => setAdjustQty(e.target.value)}
                placeholder="-2"
                step="0.01"
                type="number"
                value={adjustQty}
              />
            </label>
            <label className="cash-field">
              <span>Motivo</span>
              <select
                onChange={(e) =>
                  setAdjustReason(e.target.value as InventoryAdjustmentReason)
                }
                value={adjustReason}
              >
                {inventoryAdjustmentReasons.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="cash-field">
              <span>Notas (opcional)</span>
              <input
                onChange={(e) => setAdjustNotes(e.target.value)}
                placeholder="Detalle del ajuste"
                type="text"
                value={adjustNotes}
              />
            </label>
            <div className="confirm-dialog__actions">
              <button
                className="button button--secondary"
                onClick={() => setShowAdjust(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="button button--primary"
                disabled={!adjustQty || Number(adjustQty) === 0}
                onClick={handleAdjust}
                type="button"
              >
                Confirmar ajuste
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
