"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  MinusCircle,
  Pencil,
  Plus,
  Send,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import {
  paymentMethods,
  paymentStatusMeta,
  paymentsRecords,
  formatGTQ,
  getPaymentTotal,
  getPaymentRemaining,
  type PaymentRecord,
  type PaymentMethod,
  type PaymentStatus,
} from "@/data/fixtures/payments";
import { usePaymentsSession } from "../payments-session-provider";

export function PaymentDetailView({ recordId }: { recordId: string }) {
  const { records, addPayment, applyTip, applyDiscount } = usePaymentsSession();
  const record = records.find((item) => item.id === recordId);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [tipAmount, setTipAmount] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [feedback, setFeedback] = useState("");

  if (!record) {
    return (
      <div className="payments-page">
        <Link className="text-action" href="/operation/payments">
          <ArrowLeft aria-hidden="true" size={16} /> Volver a pagos
        </Link>
        <div className="ops-empty-state order-not-found">
          <strong>Esta comanda no está disponible</strong>
          <span>Puede haberse reiniciado al recargar los datos simulados.</span>
        </div>
      </div>
    );
  }

  const status = paymentStatusMeta[record.status];
  const paidAmount = getPaymentTotal(record);
  const remaining = getPaymentRemaining(record);
  const isPaid = record.status === "paid";
  const hasDifference = record.status === "difference";

  const handleAddPayment = () => {
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) return;

    const result = addPayment({
      recordId: record.id,
      method: paymentMethod,
      amount,
      reference: paymentRef || undefined,
      collectedBy: "Antony",
    });

    if (result) {
      setFeedback(`Pago de ${formatGTQ(amount)} registrado (${paymentMethods.find((m) => m.value === paymentMethod)?.label}).`);
      setShowAddPayment(false);
      setPaymentAmount("");
      setPaymentRef("");
    }
  };

  const handleTip = () => {
    const amount = Number(tipAmount);
    if (amount < 0) return;

    applyTip(record.id, amount);
    setFeedback(`Propina de ${formatGTQ(amount)} aplicada. Nuevo total: ${formatGTQ(record.subtotal + amount - record.discount)}.`);
    setShowTip(false);
    setTipAmount("");
  };

  const handleDiscount = () => {
    const amount = Number(discountAmount);
    if (amount < 0) return;

    applyDiscount(record.id, amount);
    setFeedback(`Descuento de ${formatGTQ(amount)} aplicado. Nuevo total: ${formatGTQ(record.subtotal + record.tip - amount)}.`);
    setShowDiscount(false);
    setDiscountAmount("");
  };

  const canAddPayment = !isPaid;

  return (
    <div className="payments-page payment-detail">
      <header className="ops-page-header payments-page__header">
        <div>
          <Link className="text-action" href="/operation/payments">
            <ArrowLeft aria-hidden="true" size={16} /> Volver a pagos
          </Link>
          <span className="ops-kicker">Detalle de cobro</span>
          <h1>Pago #{record.id}</h1>
          <p>{record.source}</p>
        </div>
        <span className={`payment-status payment-status--${status.tone} payment-status--large`}>
          {status.label}
        </span>
      </header>

      {feedback ? (
        <div className="ops-inline-feedback" role="status">
          <CheckCircle2 aria-hidden="true" size={18} /> {feedback}
        </div>
      ) : null}

      <section className={`payment-state-strip payment-state-strip--${status.tone}`}>
        <CreditCard aria-hidden="true" size={21} />
        <div>
          <strong>{status.label}</strong>
          <span>
            {isPaid
              ? "Comanda completamente pagada"
              : hasDifference
              ? `Exceso de ${formatGTQ(Math.abs(remaining))}`
              : `Faltan ${formatGTQ(remaining)} por cobrar`}
          </span>
        </div>
        <strong>{formatGTQ(remaining > 0 ? remaining : 0)}</strong>
      </section>

      <section className="payment-detail__summary" aria-label="Resumen del pago">
        <div>
          <span>Creado</span>
          <strong>{record.createdAt}</strong>
        </div>
        <div>
          <span>Responsable</span>
          <strong>{record.responsible}</strong>
        </div>
        <div>
          <span>Productos</span>
          <strong>{record.items.length}</strong>
        </div>
        <div>
          <span>Cobrado</span>
          <strong>{formatGTQ(paidAmount)}</strong>
        </div>
      </section>

      <div className="payment-detail__layout">
        <section className="payment-detail__items" aria-labelledby="payment-items-title">
          <div className="ops-section-heading">
            <div>
              <h2 id="payment-items-title">Productos</h2>
              <p>Desglose de la comanda</p>
            </div>
          </div>

          <div className="payment-detail__item-list">
            {record.items.map((item) => (
              <div className="payment-detail-item" key={item.id}>
                <span className="payment-detail-item__quantity">
                  {item.quantity}×
                </span>
                <div>
                  <strong>{item.name}</strong>
                  {item.assignedTo ? (
                    <small> → {item.assignedTo}</small>
                  ) : null}
                </div>
                <strong>{formatGTQ(item.total)}</strong>
              </div>
            ))}
          </div>

          <div className="payment-detail__totals">
            <div>
              <span>Subtotal</span>
              <strong>{formatGTQ(record.subtotal)}</strong>
            </div>
            {record.tip > 0 && (
              <div>
                <span>Propina</span>
                <strong className="text-success">+ {formatGTQ(record.tip)}</strong>
              </div>
            )}
            {record.discount > 0 && (
              <div>
                <span>Descuento</span>
                <strong className="text-warning">- {formatGTQ(record.discount)}</strong>
              </div>
            )}
            <div className="payment-detail__grand-total">
              <span>Total</span>
              <strong>{formatGTQ(record.total)}</strong>
            </div>
            <div className="payment-detail__paid">
              <span>Cobrado</span>
              <strong className="text-success">{formatGTQ(paidAmount)}</strong>
            </div>
            <div className="payment-detail__remaining">
              <span>{hasDifference ? "Exceso" : "Falta por cobrar"}</span>
              <strong className={hasDifference ? "text-danger" : "text-warning"}>
                {formatGTQ(Math.abs(remaining))}
              </strong>
            </div>
          </div>

          <div className="payment-actions-bar">
            {canAddPayment && (
              <button
                className="button button--primary"
                onClick={() => setShowAddPayment(true)}
                type="button"
              >
                <Plus aria-hidden="true" size={17} /> Registrar pago
              </button>
            )}
            {!isPaid && (
              <>
                <button
                  className="button button--secondary"
                  onClick={() => setShowTip(true)}
                  type="button"
                >
                  <Plus aria-hidden="true" size={17} /> Agregar propina
                </button>
                <button
                  className="button button--secondary"
                  onClick={() => setShowDiscount(true)}
                  type="button"
                >
                  <MinusCircle aria-hidden="true" size={17} /> Aplicar descuento
                </button>
              </>
            )}
            <Link
              className="button button--secondary"
              href={`/operation/payments/${record.id}/prebill`}
            >
              <Send aria-hidden="true" size={17} /> Ver precuenta
            </Link>
          </div>
        </section>

        <aside className="payment-actions" aria-labelledby="payment-actions-title">
          <div>
            <span>Pagos registrados</span>
            <h2 id="payment-actions-title">Historial de cobros</h2>
          </div>

          <div className="payment-history">
            {record.payments.map((payment) => (
              <div className="payment-history-item" key={payment.id}>
                <div className="payment-history__method">
                  <span className="payment-method-badge">
                    {paymentMethods.find((m) => m.value === payment.method)?.label ?? payment.method}
                  </span>
                  <strong>{formatGTQ(payment.amount)}</strong>
                </div>
                <div className="payment-history__meta">
                  <span>{payment.collectedAt}</span>
                  <span>{payment.collectedBy}</span>
                  {payment.reference && <span>Ref: {payment.reference}</span>}
                </div>
              </div>
            ))}
            {record.payments.length === 0 && (
              <div className="ops-empty-state">
                <strong>Sin pagos registrados</strong>
                <span>Registra el primer pago usando el botón de arriba.</span>
              </div>
            )}
          </div>

          <div className="payment-trace">
            <strong>Trazabilidad simulada</strong>
            <span>{record.createdAt} · Comanda creada</span>
            {record.payments.map((p) => (
              <span key={p.id}>
                {p.collectedAt} · {paymentMethods.find((m) => m.value === p.method)?.label} {formatGTQ(p.amount)}
              </span>
            ))}
          </div>
        </aside>
      </div>

      <p className="mock-disclaimer">
        Las acciones cambian únicamente el estado local hasta integrar backend y permisos.
      </p>

      {showAddPayment ? (
        <div className="confirm-dialog__backdrop" role="presentation">
          <section
            aria-labelledby="add-payment-title"
            aria-modal="true"
            className="confirm-dialog"
            role="dialog"
          >
            <button
              aria-label="Cerrar pago"
              className="icon-button confirm-dialog__close"
              onClick={() => setShowAddPayment(false)}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
            <span className="confirm-dialog__icon">
              <CreditCard aria-hidden="true" size={22} />
            </span>
            <h2 id="add-payment-title">Registrar pago</h2>
            <p>Comanda: <strong>{record.source}</strong> · Falta: <strong>{formatGTQ(remaining)}</strong></p>

            <label className="payment-field">
              <span>Método</span>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
                {paymentMethods.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </label>

            <label className="payment-field">
              <span>Monto</span>
              <input
                type="number"
                step="0.01"
                min={0.01}
                max={remaining > 0 ? remaining : record.total}
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder={formatGTQ(remaining > 0 ? remaining : record.total)}
              />
            </label>

            <label className="payment-field">
              <span>Referencia (opcional)</span>
              <input
                type="text"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                placeholder="TXN-12345"
              />
            </label>

            <div className="confirm-dialog__actions">
              <button
                className="button button--secondary"
                onClick={() => setShowAddPayment(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="button button--primary"
                disabled={!paymentAmount || Number(paymentAmount) <= 0}
                onClick={handleAddPayment}
                type="button"
              >
                Confirmar pago
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {showTip ? (
        <div className="confirm-dialog__backdrop" role="presentation">
          <section
            aria-labelledby="tip-title"
            aria-modal="true"
            className="confirm-dialog"
            role="dialog"
          >
            <button
              aria-label="Cerrar propina"
              className="icon-button confirm-dialog__close"
              onClick={() => setShowTip(false)}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
            <span className="confirm-dialog__icon">
              <Plus aria-hidden="true" size={22} />
            </span>
            <h2 id="tip-title">Agregar propina</h2>
            <p>Subtotal actual: <strong>{formatGTQ(record.subtotal)}</strong></p>

            <label className="payment-field">
              <span>Monto de propina</span>
              <input
                type="number"
                step="0.01"
                min={0}
                value={tipAmount}
                onChange={(e) => setTipAmount(e.target.value)}
                placeholder="Ej. 20.00"
              />
            </label>

            <div className="confirm-dialog__actions">
              <button
                className="button button--secondary"
                onClick={() => setShowTip(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="button button--primary"
                disabled={tipAmount === "" || Number(tipAmount) < 0}
                onClick={handleTip}
                type="button"
              >
                Aplicar propina
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {showDiscount ? (
        <div className="confirm-dialog__backdrop" role="presentation">
          <section
            aria-labelledby="discount-title"
            aria-modal="true"
            className="confirm-dialog"
            role="dialog"
          >
            <button
              aria-label="Cerrar descuento"
              className="icon-button confirm-dialog__close"
              onClick={() => setShowDiscount(false)}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
            <span className="confirm-dialog__icon confirm-dialog__icon--warning">
              <MinusCircle aria-hidden="true" size={22} />
            </span>
            <h2 id="discount-title">Aplicar descuento</h2>
            <p>Subtotal actual: <strong>{formatGTQ(record.subtotal)}</strong></p>

            <label className="payment-field">
              <span>Monto de descuento</span>
              <input
                type="number"
                step="0.01"
                min={0}
                max={record.subtotal + record.tip}
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                placeholder="Ej. 50.00"
              />
            </label>

            <div className="confirm-dialog__actions">
              <button
                className="button button--secondary"
                onClick={() => setShowDiscount(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="button button--primary"
                disabled={discountAmount === "" || Number(discountAmount) < 0}
                onClick={handleDiscount}
                type="button"
              >
                Aplicar descuento
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}