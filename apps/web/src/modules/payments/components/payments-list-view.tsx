"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  CreditCard,
  MinusCircle,
  Plus,
  Search,
  Utensils,
} from "lucide-react";
import {
  paymentMethods,
  paymentStatusMeta,
  paymentsRecords,
  paymentSummary,
  formatGTQ,
  getPaymentTotal,
  getPaymentRemaining,
  type PaymentStatus,
} from "@/data/fixtures/payments";
import { usePaymentsSession } from "../payments-session-provider";

type StatusFilter = "active" | PaymentStatus;

const statusFilterOptions: { value: StatusFilter; label: string }[] = [
  { value: "active", label: "Activas" },
  { value: "pending", label: "Pendientes" },
  { value: "partial", label: "Parciales" },
  { value: "paid", label: "Pagadas" },
  { value: "difference", label: "Diferencias" },
];

const channelMeta = {
  table: { label: "Mesa", Icon: Utensils },
  delivery: { label: "Delivery", Icon: Search },
  pickup: { label: "Recoger", Icon: Plus },
} as const;

export function PaymentsListView() {
  const { records } = usePaymentsSession();
  const [filter, setFilter] = useState<StatusFilter>("active");
  const [query, setQuery] = useState("");

  const visibleRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es");
    return records.filter((record) => {
      const matchesStatus =
        filter === "active"
          ? record.status !== "paid"
          : record.status === filter;
      const matchesQuery =
        !normalizedQuery ||
        record.id.toLocaleLowerCase("es").includes(normalizedQuery) ||
        record.source.toLocaleLowerCase("es").includes(normalizedQuery) ||
        record.items.some((item) =>
          item.name.toLocaleLowerCase("es").includes(normalizedQuery),
        );
      return matchesStatus && matchesQuery;
    });
  }, [filter, records, query]);

  const getCount = (value: StatusFilter) =>
    records.filter((record) =>
      value === "active" ? record.status !== "paid" : record.status === value,
    ).length;

  return (
    <div className="payments-page">
      <header className="ops-page-header payments-page__header">
        <div>
          <span className="ops-kicker">Módulo operativo</span>
          <h1>Pagos</h1>
          <p>Controla cobros, divisiones y diferencias de cada comanda.</p>
        </div>
        <div className="ops-header-actions">
          <span className="payments-summary-counter">
            <CreditCard aria-hidden="true" size={18} />{" "}
            {paymentSummary.pendingAmount > 0
              ? `${formatGTQ(paymentSummary.pendingAmount)} pendientes`
              : "Todo cobrado"}
          </span>
        </div>
      </header>

      <section className="payments-summary" aria-label="Resumen de pagos">
        <div>
          <span>Total</span>
          <strong>{paymentSummary.total}</strong>
        </div>
        <div>
          <span>Pendientes</span>
          <strong>{paymentSummary.pending}</strong>
        </div>
        <div>
          <span>Parciales</span>
          <strong>{paymentSummary.partial}</strong>
        </div>
        <div className="payments-summary__danger">
          <span>Diferencias</span>
          <strong>{paymentSummary.difference}</strong>
        </div>
        <div>
          <span>Pendiente cobrar</span>
          <strong className="text-warning">{formatGTQ(paymentSummary.pendingAmount)}</strong>
        </div>
      </section>

      <section
        className="payments-workspace"
        aria-labelledby="active-payments-title"
      >
        <div className="payments-toolbar">
          <div className="payments-filter" aria-label="Filtrar pagos">
            {statusFilterOptions.map((item) => (
              <button
                aria-pressed={filter === item.value}
                key={item.value}
                onClick={() => setFilter(item.value)}
                type="button"
              >
                {item.label} <span>{getCount(item.value)}</span>
              </button>
            ))}
          </div>
          <label className="payments-search">
            <Search aria-hidden="true" size={18} />
            <span className="sr-only">Buscar pagos</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Comanda, mesa, cliente o producto"
              type="search"
              value={query}
            />
          </label>
        </div>

        <div className="ops-section-heading payments-list-heading">
          <div>
            <h2 id="active-payments-title">
              {statusFilterOptions.find((item) => item.value === filter)?.label}
            </h2>
            <p>{visibleRecords.length} resultados con datos simulados</p>
          </div>
        </div>

        <div className="payments-list">
          {visibleRecords.map((record) => {
            const status = paymentStatusMeta[record.status];
            const paidAmount = getPaymentTotal(record);
            const remaining = getPaymentRemaining(record);
            const channel = channelMeta[record.channel];
            const ChannelIcon = channel.Icon;

            return (
              <Link
                aria-label={`Abrir pago ${record.id}, ${status.label}`}
                className={`payment-row payment-row--${status.tone}`}
                href={`/operation/payments/${record.id}`}
                key={record.id}
              >
                <div className="payment-row__identity">
                  <span className="payment-channel-icon">
                    <ChannelIcon aria-hidden="true" size={18} />
                  </span>
                  <div>
                    <strong>#{record.id}</strong>
                    <span>{record.source}</span>
                  </div>
                </div>
                <div className="payment-row__items">
                  <strong>
                    {record.items.map((item) => item.name).join(" · ")}
                  </strong>
                  <span>{record.items.length} productos</span>
                </div>
                <div className="payment-row__amounts">
                  <div className="payment-row__paid">
                    <span>Cobrado</span>
                    <strong>{formatGTQ(paidAmount)}</strong>
                  </div>
                  <div className="payment-row__total">
                    <span>Total</span>
                    <strong>{formatGTQ(record.total)}</strong>
                  </div>
                  {remaining > 0 && (
                    <div className="payment-row__remaining">
                      <span>Falta</span>
                      <strong className="text-warning">{formatGTQ(remaining)}</strong>
                    </div>
                  )}
                </div>
                <div className="payment-row__methods">
                  {record.payments.map((p) => (
                    <span key={p.id} className="payment-method-badge">
                      {paymentMethods.find((m) => m.value === p.method)?.label ?? p.method}
                    </span>
                  ))}
                  {record.payments.length === 0 && (
                    <span className="payment-method-badge payment-method-badge--none">
                      Sin pagos
                    </span>
                  )}
                </div>
                <span className={`payment-status payment-status--${status.tone}`}>
                  {status.label}
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="payment-row__arrow"
                  size={18}
                />
              </Link>
            );
          })}
        </div>

        {visibleRecords.length === 0 ? (
          <div className="ops-empty-state">
            <strong>No encontramos pagos</strong>
            <span>Prueba otro estado o cambia la búsqueda.</span>
          </div>
        ) : null}
      </section>

      <p className="mock-disclaimer">
        Los pagos y montos son simulados; se reinician al recargar.
      </p>
    </div>
  );
}