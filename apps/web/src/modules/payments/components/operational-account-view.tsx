"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { OperationalAccount } from "../live-contract";

const makeId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const money = (value: number) =>
  new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(
    value,
  );
const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

export function OperationalAccountView({ accountId }: { accountId: string }) {
  const [account, setAccount] = useState<OperationalAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState("CASH");
  const [amount, setAmount] = useState("");
  const [tipAmount, setTipAmount] = useState("");
  const [reference, setReference] = useState("");
  const [feedback, setFeedback] = useState("");

  const load = useCallback(async () => {
    if (!isUuid(accountId)) {
      setError("La cuenta indicada no es válida.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/bff/operational/accounts/${accountId}`, {
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(
          (
            (await response.json().catch(() => null)) as {
              message?: string;
            } | null
          )?.message ?? "No pudimos cargar la cuenta.",
        );
      setAccount((await response.json()) as OperationalAccount);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No pudimos cargar la cuenta.",
      );
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!account || submitting) return;
    setSubmitting(true);
    setError(null);
    setFeedback("");
    try {
      const response = await fetch(
        `/bff/operational/accounts/${account.account.id}/payments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": makeId(),
            "X-Request-Id": makeId(),
          },
          body: JSON.stringify({
            method,
            ...(amount ? { amount: Number(amount) } : {}),
            ...(tipAmount ? { tipAmount: Number(tipAmount) } : {}),
            ...(reference ? { reference } : {}),
            registerCode: "MAIN",
          }),
        },
      );
      if (!response.ok)
        throw new Error(
          (
            (await response.json().catch(() => null)) as {
              message?: string;
            } | null
          )?.message ?? "No pudimos registrar el pago.",
        );
      const receipt = (await response.json()) as {
        amount: number;
        balance: number;
        idempotentReplay: boolean;
      };
      setFeedback(
        `${receipt.idempotentReplay ? "Solicitud repetida: " : "Pago registrado: "}${money(receipt.amount)}. Saldo informado por backend: ${money(receipt.balance)}.`,
      );
      setAmount("");
      setTipAmount("");
      setReference("");
      await load();
      await fetch("/bff/operational/cash-sessions?registerCode=MAIN", {
        cache: "no-store",
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos registrar el pago.",
      );
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  if (loading)
    return (
      <main className="payments-page" aria-busy="true">
        <p role="status">Cargando cuenta…</p>
      </main>
    );
  if (!account)
    return (
      <main className="payments-page">
        <Link className="text-action" href="/operation/payments">
          <ArrowLeft size={16} aria-hidden="true" /> Volver a pagos
        </Link>
        <p role="alert">{error ?? "No encontramos la cuenta."}</p>
      </main>
    );
  return (
    <main className="payments-page payment-detail">
      <header className="ops-page-header payments-page__header">
        <div>
          <Link className="text-action" href="/operation/payments">
            <ArrowLeft size={16} aria-hidden="true" /> Volver a pagos
          </Link>
          <span className="ops-kicker">Cuenta operativa</span>
          <h1>{account.account.name}</h1>
          <p>
            Cuenta {account.account.id} · Estado: {account.account.status}
          </p>
        </div>
      </header>
      {feedback ? (
        <p className="ops-inline-feedback" role="status">
          {feedback}
        </p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      <section
        className="payment-detail__summary"
        aria-label="Totales de cuenta"
      >
        <div>
          <span>Total</span>
          <strong>{money(account.total)}</strong>
        </div>
        <div>
          <span>Pagado</span>
          <strong>{money(account.paid)}</strong>
        </div>
        <div>
          <span>Saldo</span>
          <strong>{money(account.balance)}</strong>
        </div>
        <div>
          <span>Propinas</span>
          <strong>{money(account.tips)}</strong>
        </div>
      </section>
      <section aria-labelledby="orders-title">
        <h2 id="orders-title">Consumos</h2>
        {account.orders.length === 0 ? (
          <p>No hay consumos en esta cuenta.</p>
        ) : (
          <ul>
            {account.orders.map((order) => (
              <li key={order.id}>
                {order.code} · {order.status} · {money(order.total)}
              </li>
            ))}
          </ul>
        )}
      </section>
      {account.account.status !== "PAID" ? (
        <form
          className="payment-actions-bar"
          onSubmit={submit}
          aria-label="Registrar pago"
        >
          <h2>Registrar pago</h2>
          <label>
            Método
            <select
              value={method}
              onChange={(event) => setMethod(event.target.value)}
            >
              <option value="CASH">Efectivo</option>
              <option value="CARD_EXTERNAL">Tarjeta externa</option>
              <option value="TRANSFER">Transferencia</option>
            </select>
          </label>
          <label>
            Monto (vacío = saldo pendiente)
            <input
              min="0.01"
              step="0.01"
              type="number"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label>
            Propina
            <input
              min="0"
              step="0.01"
              type="number"
              value={tipAmount}
              onChange={(event) => setTipAmount(event.target.value)}
            />
          </label>
          <label>
            Referencia
            <input
              maxLength={120}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
          </label>
          <button
            className="button button--primary"
            disabled={submitting}
            type="submit"
          >
            {submitting ? "Registrando…" : "Registrar pago"}
          </button>
        </form>
      ) : null}
      <section>
        <h2>Operaciones no disponibles</h2>
        <p>
          El cierre de cuenta, la precuenta y las devoluciones/reversiones
          requieren endpoints backend que aún no existen para esta superficie.
        </p>
      </section>
      <section aria-labelledby="payments-title">
        <h2 id="payments-title">Pagos registrados</h2>
        {account.payments.length === 0 ? (
          <p>No hay pagos registrados.</p>
        ) : (
          <ul>
            {account.payments.map((payment) => (
              <li key={payment.id}>
                {payment.method} · {money(payment.amount)} · {payment.status}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
