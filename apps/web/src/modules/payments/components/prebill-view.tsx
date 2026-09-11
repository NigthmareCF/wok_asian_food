"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  FileText,
  Minus,
  Plus,
  Printer,
  X,
} from "lucide-react";
import {
  paymentMethods,
  paymentsRecords,
  formatGTQ,
  getPaymentTotal,
  getPaymentRemaining,
  type PaymentRecord,
} from "@/data/fixtures/payments";
import { usePaymentsSession } from "../payments-session-provider";

export function PreBillView({ recordId }: { recordId: string }) {
  const { records } = usePaymentsSession();
  const record = records.find((item) => item.id === recordId);
  const [showPrintConfirm, setShowPrintConfirm] = useState(false);
  const [includeTip, setIncludeTip] = useState(true);
  const [feedback, setFeedback] = useState("");

  if (!record) {
    return (
      <div className="payments-page prebill-page">
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

  const paidAmount = getPaymentTotal(record);
  const remaining = getPaymentRemaining(record);
  const tipAmount = includeTip ? record.tip : 0;
  const displayTotal = record.subtotal + tipAmount - record.discount;

  const handlePrint = () => {
    setFeedback("Precuenta enviada a impresora (simulado).");
    setShowPrintConfirm(false);
  };

  return (
    <div className="payments-page prebill-page">
      <header className="ops-page-header prebill-page__header">
        <div>
          <Link className="text-action" href={`/operation/payments/${recordId}`}>
            <ArrowLeft aria-hidden="true" size={16} /> Volver al cobro
          </Link>
          <span className="ops-kicker">Precuenta</span>
          <h1>Precuenta #{record.id}</h1>
          <p>{record.source}</p>
        </div>
        <div className="prebill-header-actions">
          <button
            className="button button--secondary button--compact"
            onClick={() => setShowPrintConfirm(true)}
            type="button"
          >
            <Printer aria-hidden="true" size={17} /> Imprimir
          </button>
        </div>
      </header>

      {feedback ? (
        <div className="ops-inline-feedback" role="status">
          <CheckCircle2 aria-hidden="true" size={18} /> {feedback}
        </div>
      ) : null}

      <section className="prebill-customer" aria-label="Datos del cliente">
        <div>
          <span>Cliente</span>
          <strong>{record.source}</strong>
        </div>
        <div>
          <span>Responsable</span>
          <strong>{record.responsible}</strong>
        </div>
        <div>
          <span>Creado</span>
          <strong>{record.createdAt}</strong>
        </div>
      </section>

      <section className="prebill-items" aria-labelledby="prebill-items-title">
        <h2 id="prebill-items-title">Detalle</h2>
        <div className="prebill-table">
          <div className="prebill-table__header">
            <span>Producto</span>
            <span>Cant.</span>
            <span>P. Unit.</span>
            <span>Total</span>
          </div>
          {record.items.map((item) => (
            <div className="prebill-table__row" key={item.id}>
              <span>{item.name}</span>
              <span>{item.quantity}</span>
              <span>{formatGTQ(item.unitPrice)}</span>
              <span>{formatGTQ(item.total)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="prebill-totals" aria-label="Totales">
        <div className="prebill-total-row">
          <span>Subtotal</span>
          <strong>{formatGTQ(record.subtotal)}</strong>
        </div>
        {record.discount > 0 && (
          <div className="prebill-total-row prebill-total-row--discount">
            <span>Descuento</span>
            <strong>- {formatGTQ(record.discount)}</strong>
          </div>
        )}
        <div className="prebill-total-row prebill-total-row--tip">
          <label>
            <input
              type="checkbox"
              checked={includeTip}
              onChange={(e) => setIncludeTip(e.target.checked)}
            />
            <span>Propina sugerida ({record.tip > 0 ? `${Math.round((record.tip / record.subtotal) * 100)}%` : "10%"})</span>
          </label>
          <strong>{includeTip ? `+ ${formatGTQ(record.tip)}` : "+ 0.00"}</strong>
        </div>
        <div className="prebill-total-row prebill-total-row--grand">
          <span>Total</span>
          <strong>{formatGTQ(displayTotal)}</strong>
        </div>
        <div className="prebill-total-row prebill-total-row--paid">
          <span>Ya cobrado</span>
          <strong className="text-success">{formatGTQ(paidAmount)}</strong>
        </div>
        <div className="prebill-total-row prebill-total-row--remaining">
          <span>{remaining > 0 ? "Falta por cobrar" : "Saldo a favor"}</span>
          <strong className={remaining > 0 ? "text-warning" : "text-success"}>
            {formatGTQ(Math.abs(remaining > 0 ? remaining : displayTotal - paidAmount))}
          </strong>
        </div>
      </section>

      <section className="prebill-payment-methods" aria-label="Métodos de pago">
        <h3>Desglose por método</h3>
        <div className="prebill-methods-grid">
          {paymentMethods.map((method) => {
            const methodPayments = record.payments.filter((p) => p.method === method.value);
            const methodTotal = methodPayments.reduce((sum, p) => sum + p.amount, 0);
            return methodTotal > 0 ? (
              <div className="prebill-method" key={method.value}>
                <span className="prebill-method__label">{method.label}</span>
                <strong className="prebill-method__amount">{formatGTQ(methodTotal)}</strong>
                <div className="prebill-method__details">
                  {methodPayments.map((p) => (
                    <span key={p.id}>
                      {p.collectedAt} · {p.collectedBy}
                      {p.reference ? ` · {p.reference}` : ""}
                    </span>
                  ))}
                </div>
              </div>
            ) : null;
          })}
        </div>
      </section>

      <p className="mock-disclaimer">
        Precuenta generada con datos simulados. No es un documento fiscal válido.
      </p>

      {showPrintConfirm ? (
        <div className="confirm-dialog__backdrop" role="presentation">
          <section
            aria-labelledby="print-confirm-title"
            aria-modal="true"
            className="confirm-dialog"
            role="dialog"
          >
            <button
              aria-label="Cerrar confirmación"
              className="icon-button confirm-dialog__close"
              onClick={() => setShowPrintConfirm(false)}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
            <span className="confirm-dialog__icon">
              <Printer aria-hidden="true" size={22} />
            </span>
            <h2 id="print-confirm-title">Confirmar impresión</h2>
            <p>
              Se imprimirá la precuenta para <strong>{record.source}</strong> con un total de{" "}
              <strong>{formatGTQ(displayTotal)}</strong>.
            </p>
            <label>
              <input
                type="checkbox"
                checked={includeTip}
                onChange={(e) => setIncludeTip(e.target.checked)}
              />
              Incluir propina sugerida
            </label>
            <div className="confirm-dialog__actions">
              <button
                className="button button--secondary"
                onClick={() => setShowPrintConfirm(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="button button--primary"
                onClick={handlePrint}
                type="button"
              >
                <Printer aria-hidden="true" size={17} /> Imprimir precuenta
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}