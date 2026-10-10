"use client";
import Link from "next/link";
import { usePickupResource } from "@/modules/client-order-tracking/use-pickup-resource";
import { isAccountDetails, formatMoney } from "../live-contract";
export function PreBillView({ recordId }: { recordId: string }) {
  const r = usePickupResource(
      `/bff/operational/accounts/${recordId}`,
      isAccountDetails,
    ),
    a = r.data;
  return (
    <div className="payments-page prebill-page">
      <header className="ops-page-header">
        <div>
          <Link
            className="text-action"
            href={`/operation/payments/${recordId}`}
          >
            Volver a cuenta
          </Link>
          <h1>Precuenta</h1>
          <p>COMPROBANTE / PRECUENTA — NO ES DTE — NO FEL CERTIFICADO.</p>
        </div>
        <button
          className="button button--secondary"
          disabled={!a || !!r.error}
          onClick={() => window.print()}
        >
          Imprimir precuenta
        </button>
        <button className="button button--secondary" onClick={r.reload}>
          Actualizar
        </button>
      </header>
      {r.error ? <p role="alert">{r.error.message}</p> : null}
      {!a && !r.error ? <p role="status">Cargando precuenta…</p> : null}
      {a ? (
        <section className="prebill-items">
          <h2>WOK Asian Food</h2>
          <p>
            {a.account.diningTableName} · {a.account.name}
          </p>
          <p>
            Precios registrados al pedir. Los consumos anulados se excluyen del
            total.
          </p>
          {a.orders.map((o) => (
            <section key={o.id}>
              <h3>
                {o.code} · {o.status}
              </h3>
              {o.items.map((i) => (
                <p key={i.id}>
                  {i.quantity} × {i.name} · Unitario{" "}
                  {formatMoney(i.unitPrice, o.currency)} ·{" "}
                  {formatMoney(i.lineTotal, o.currency)}
                </p>
              ))}
              <p>
                Subtotal {formatMoney(o.subtotal, o.currency)} · Descuento{" "}
                {formatMoney(o.discount, o.currency)} ·{" "}
                {o.status === "CANCELLED"
                  ? "Anulado: no suma"
                  : `Total ${formatMoney(o.total, o.currency)}`}
              </p>
            </section>
          ))}
          {a.currencyTotals.map((t) => (
            <div key={t.currency}>
              <p>Total {formatMoney(t.total, t.currency)}</p>
              <p>Pagado {formatMoney(t.paid, t.currency)}</p>
              <p>Saldo {formatMoney(t.balance, t.currency)}</p>
              <p>Propinas {formatMoney(t.tips, t.currency)}</p>
            </div>
          ))}
          <h3>Pagos</h3>
          {a.payments.length ? (
            a.payments.map((p) => (
              <p key={p.id}>
                {p.method} · {p.status} · {formatMoney(p.amount, p.currency)} ·{" "}
                {new Date(p.capturedAt).toLocaleString("es-GT")}
              </p>
            ))
          ) : (
            <p>Sin pagos registrados.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
