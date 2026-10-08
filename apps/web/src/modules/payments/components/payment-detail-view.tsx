"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAccountFinance } from "../use-account-finance";
import {
  formatMoney,
  parseAmount,
  paymentMethods,
  type PaymentMethod,
} from "../live-contract";
import {
  type DurableAttempt,
  type PreparationInput,
} from "../attempt-contract";
type ConfirmationDialog = {
  kind: "capture" | "retire" | "resolve";
  target: DurableAttempt;
};
const labels = {
  PREPARED: "Preparado; aún no solicitado para captura",
  PENDING: "Resultado pendiente",
  CONFIRMED: "Pago confirmado",
  REJECTED: "Rechazado sin pago WOK",
  RETIRED: "Intento retirado",
};
export function PaymentDetailView({
  recordId,
  administrativeAttemptId,
}: {
  recordId: string;
  administrativeAttemptId?: string;
}) {
  const f = useAccountFinance(recordId, administrativeAttemptId),
    a = f.data,
    row = f.attempt,
    review = f.review;
  const [amount, setAmount] = useState(""),
    [tip, setTip] = useState("0"),
    [register, setRegister] = useState("MAIN"),
    [reference, setReference] = useState(""),
    [method, setMethod] = useState<PaymentMethod>("CASH"),
    [reason, setReason] = useState(""),
    [evidence, setEvidence] = useState(""),
    [evidenceReference, setEvidenceReference] = useState(""),
    [physical, setPhysical] = useState("UNKNOWN"),
    [dialog, setDialog] = useState<ConfirmationDialog | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null),
    statusFocus = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    if (!dialog) return;
    const before = previousFocus.current,
      fallback = statusFocus.current;
    return () => {
      setTimeout(() => {
        if (before?.isConnected && !(before as HTMLButtonElement).disabled)
          before.focus();
        else if (fallback?.isConnected) fallback.focus();
      }, 0);
    };
  }, [dialog]);
  const allowed = f.permissions.includes("payments:manage"),
    canResolve =
      allowed &&
      f.permissions.includes("payments:resolve") &&
      review?.ownerUserId !== f.userId &&
      review?.availableActions.includes("RETIRE_WITH_EVIDENCE") &&
      !f.blocked;
  const n = parseAmount(amount),
    t = parseAmount(tip),
    payable =
      !!a &&
      ["OPEN", "IN_COBRO"].includes(a.account.status) &&
      a.currencies.length === 1 &&
      a.pendingOrderCount === 0 &&
      (a.balance ?? 0) > 0;
  const replace =
    !!row &&
    row.status === "REJECTED" &&
    row.availableActions.includes("REPLACE") &&
    !f.blocked &&
    !f.administrative;
  const compose = (f.canPrepare || replace) && payable && allowed;
  const valid =
    n !== null &&
    n > 0 &&
    t !== null &&
    n <= Number(a?.balance) &&
    (method !== "CASH" || /^[A-Z0-9_-]{1,32}$/.test(register));
  const input = (): PreparationInput | null =>
    n === null || t === null || !a
      ? null
      : {
          method,
          amount: n,
          tipAmount: t,
          currency: a.currencies[0],
          ...(reference ? { reference } : {}),
          ...(method === "CASH" ? { registerCode: register } : {}),
          expectedPreviousAttemptId: replace
            ? row!.attemptId
            : (f.context?.expectedPreviousAttemptId ?? null),
        };
  function open(kind: ConfirmationDialog["kind"], target: DurableAttempt) {
    previousFocus.current = document.activeElement as HTMLElement;
    setDialog({ kind, target: structuredClone(target) });
  }
  async function confirm() {
    const selected = dialog;
    if (!selected) return;
    if (selected.kind === "capture") await f.capture(selected.target);
    else if (selected.kind === "retire")
      await f.retire(reason, selected.target);
    else
      await f.resolve(
        {
          expectedVersion: selected.target.version,
          reason,
          evidenceSummary: evidence,
          ...(evidenceReference ? { evidenceReference } : {}),
          physicalReceiptStatus: "NOT_RECEIVED",
        },
        selected.target,
      );
    setDialog(null);
  }
  const captureAllowed =
    !!row &&
    !f.blocked &&
    !f.administrative &&
    (row.availableActions.includes("CAPTURE") ||
      row.availableActions.includes("CONTINUE_SAME_ATTEMPT"));
  function showAttempt(item: DurableAttempt) {
    return (
      <>
        <h2 ref={statusFocus} tabIndex={-1}>
          {labels[item.status]}
        </h2>
        <p>
          Intento servidor: {item.attemptId} · Versión {item.version}
        </p>
        <p>
          Importe congelado:{" "}
          <strong>{formatMoney(item.amount, item.currency)}</strong> · Propina:{" "}
          {formatMoney(item.tipAmount, item.currency)} ·{" "}
          {paymentMethods.find((m) => m.value === item.method)?.label} · Caja:{" "}
          {item.registerCode ?? "No aplica"}
        </p>
        {item.reference ? <p>Referencia: {item.reference}</p> : null}
        {item.executionRequestedAt ? (
          <p>
            Solicitud original:{" "}
            {new Date(item.executionRequestedAt).toLocaleString("es-GT")}
          </p>
        ) : null}
        {item.status === "PENDING" ? (
          <p>
            No vuelvas a recibir dinero. Consultar y recuperar solo leen el
            registro; continuar requiere confirmar este mismo intento.
          </p>
        ) : null}
        {item.status === "REJECTED" ? (
          <p role="status">
            Este intento no registró un pago en WOK: {item.rejectionMessage}.
            Comprueba por separado qué dinero se recibió.
          </p>
        ) : null}
        {item.confirmation ? (
          <>
            <p role="status">
              Pago registrado: {item.confirmation.paymentId} ·{" "}
              {formatMoney(
                item.confirmation.amount,
                item.confirmation.currency,
              )}{" "}
              · {new Date(item.confirmation.capturedAt).toLocaleString("es-GT")}
            </p>
            {item.receiptAvailability === "RECONCILIATION_REQUIRED" ? (
              <p role="alert">
                La confirmación se conserva; el saldo requiere conciliación. No
                vuelvas a cobrar este intento.
              </p>
            ) : (
              <p>
                Saldo consultado: {formatMoney(item.balance, item.currency)}
              </p>
            )}
          </>
        ) : null}
        {item.resolution ? (
          <>
            <p>
              Retirado excepcionalmente por {item.resolution.actorId} ·{" "}
              {new Date(item.resolution.resolvedAt).toLocaleString("es-GT")}
            </p>
            <p>Motivo: {item.resolution.reason}</p>
            <p>
              Evidencia: {item.resolution.evidenceSummary}{" "}
              {item.resolution.evidenceReference}
            </p>
            <p>
              Declaración: dinero no recibido (NOT_RECEIVED). La solicitud
              anterior se conserva. Resolver no marca la cuenta pagada.
            </p>
          </>
        ) : item.status === "RETIRED" ? (
          <p>Preparación retirada; se conserva su historia.</p>
        ) : null}
      </>
    );
  }
  return (
    <div className="payments-page">
      <header className="ops-page-header">
        <div>
          <Link
            className="text-action"
            href={
              administrativeAttemptId
                ? "/admin/payment-attempts"
                : "/operation/payments"
            }
          >
            Volver a cuentas
          </Link>
          <h1>{a?.account.name ?? "Cuenta"}</h1>
          <p>{a?.account.diningTableName}</p>
        </div>
        <button
          className="button button--secondary"
          disabled={f.sending}
          onClick={f.reload}
        >
          Consultar servidor
        </button>
      </header>
      {f.error ? <p role="alert">{f.error}</p> : null}
      {f.storageNotice ? <p role="status">{f.storageNotice}</p> : null}
      {f.feedback ? <p role="status">{f.feedback}</p> : null}
      {!a && !f.error ? <p role="status">Cargando cuenta…</p> : null}
      {f.context?.blockedByAnotherOperator ? (
        <p role="status">
          Otro operador tiene un intento activo. Consulta al operador original o
          solicita revisión de otro responsable autorizado. No se capturará su
          intento desde esta cuenta.
        </p>
      ) : null}
      {row && !f.administrative ? (
        <section className="ops-work-panel" aria-label="Intento durable">
          {showAttempt(row)}
          <button
            className="button button--secondary"
            disabled={f.sending}
            onClick={() => void f.recover()}
          >
            Consultar intento
          </button>
          {captureAllowed ? (
            <button
              className="button button--primary"
              disabled={f.sending || !allowed}
              onClick={() => open("capture", row)}
            >
              {row.status === "PENDING"
                ? "Revisar continuación del mismo intento"
                : "Revisar captura"}
            </button>
          ) : null}
          {row.availableActions.includes("RETIRE") && !f.blocked ? (
            <button
              className="button button--secondary"
              disabled={f.sending || !allowed}
              onClick={() => open("retire", row)}
            >
              Retirar preparación no solicitada
            </button>
          ) : null}
        </section>
      ) : null}
      {f.administrative ? (
        <section className="ops-work-panel" aria-label="Revisión excepcional">
          <h2>Consulta del responsable</h2>
          <p>Esta consulta no autoriza capturar como el propietario.</p>
          {review ? (
            <>
              {showAttempt(review.attempt)}
              <p>
                Propietario: {review.ownerUserId} · Registro WOK vinculado:{" "}
                {review.registeredCapture ? "Existe" : "No encontrado"} · Claim:{" "}
                {review.claimState}
              </p>
              <p>
                No encontrar una captura WOK y declarar que no se recibió dinero
                físicamente son hechos distintos. Una declaración requiere
                comprobación y responsabilidad; no se deduce de un error o
                timeout.
              </p>
              {review.ownerUserId === f.userId ? (
                <p>
                  Otro responsable autorizado debe resolver un intento creado
                  por ti.
                </p>
              ) : null}
              {canResolve ? (
                <fieldset disabled={f.sending}>
                  <legend>Resolución excepcional sin captura</legend>
                  <label className="cash-field">
                    Situación del dinero físico
                    <select
                      value={physical}
                      onChange={(e) => setPhysical(e.target.value)}
                    >
                      <option value="UNKNOWN">Se desconoce</option>
                      <option value="RECEIVED">Se recibió dinero</option>
                      <option value="NOT_RECEIVED">
                        Declaro que no se recibió dinero
                      </option>
                    </select>
                  </label>
                  {physical === "NOT_RECEIVED" ? (
                    <>
                      <label className="cash-field">
                        Motivo de resolución
                        <textarea
                          maxLength={500}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                        />
                      </label>
                      <label className="cash-field">
                        Evidencia comprobada
                        <textarea
                          maxLength={1000}
                          value={evidence}
                          onChange={(e) => setEvidence(e.target.value)}
                        />
                      </label>
                      <label className="cash-field">
                        Referencia de evidencia (opcional)
                        <input
                          maxLength={200}
                          value={evidenceReference}
                          onChange={(e) => setEvidenceReference(e.target.value)}
                        />
                      </label>
                      <button
                        className="button button--secondary"
                        disabled={!reason.trim() || !evidence.trim()}
                        onClick={() => open("resolve", review.attempt)}
                      >
                        Revisar resolución sin captura
                      </button>
                    </>
                  ) : (
                    <p>
                      Dinero recibido o desconocido no permite retirar el
                      intento.
                    </p>
                  )}
                </fieldset>
              ) : (
                <p>
                  No hay una resolución excepcional autorizada. La evidencia y
                  el bloqueo se conservan.
                </p>
              )}
            </>
          ) : (
            <p>Consulta pendiente; no autoriza resolver.</p>
          )}
        </section>
      ) : null}
      {a && !f.administrative ? (
        <>
          <section
            className="payment-detail__summary"
            aria-label="Saldo de cuenta"
          >
            {a.currencyTotals.flatMap((total) =>
              ["total", "paid", "balance", "tips"].map((key, i) => (
                <div key={total.currency + key}>
                  <span>
                    {["Total", "Pagado", "Saldo", "Propinas"][i]} ·{" "}
                    {total.currency}
                  </span>
                  <strong>
                    {formatMoney(total[key as "total"], total.currency)}
                  </strong>
                </div>
              )),
            )}
          </section>
          <section className="ops-work-panel">
            <p>
              {a.pendingOrderCount} pedidos aún no cobrables ·{" "}
              {a.unfinalizedOrderCount} sin finalizar.
            </p>
            <p>
              El pago y la resolución no finalizan pedidos ni liberan la mesa.
            </p>
            <Link
              className="button button--secondary"
              href={"/operation/payments/" + recordId + "/prebill"}
            >
              Ver precuenta
            </Link>
            {a.account.diningTableId &&
            f.permissions.includes("accounts:manage") ? (
              <Link
                className="button button--secondary"
                href={"/operation/tables/" + a.account.diningTableId}
              >
                Volver a mesa
              </Link>
            ) : null}
          </section>
          <section className="ops-work-panel">
            <h2>Consumos</h2>
            {a.orders.map((o) => (
              <div className="order-detail__items" key={o.id}>
                <h3>
                  {o.code} · {o.status}
                  {o.status === "CANCELLED" ? " (excluido del total)" : ""}
                </h3>
                {o.items.map((i) => (
                  <p key={i.id}>
                    {i.quantity} × {i.name} ·{" "}
                    {formatMoney(i.unitPrice, o.currency)} ·{" "}
                    {formatMoney(i.lineTotal, o.currency)}
                  </p>
                ))}
                <p>
                  Subtotal: {formatMoney(o.subtotal, o.currency)} · Descuento
                  existente: {formatMoney(o.discount, o.currency)} · Total:{" "}
                  {formatMoney(o.total, o.currency)}
                </p>
                {f.permissions.includes("orders:manage") ? (
                  <Link href={"/operation/orders/" + o.id}>
                    Gestionar pedido
                  </Link>
                ) : null}
              </div>
            ))}
          </section>
          <section className="ops-work-panel">
            <h2>Pagos registrados</h2>
            {a.payments.length ? (
              a.payments.map((p) => (
                <p key={p.id}>
                  {formatMoney(p.amount, p.currency)} · Propina{" "}
                  {formatMoney(p.tipAmount, p.currency)} · {p.method} ·{" "}
                  {p.status} · {new Date(p.capturedAt).toLocaleString("es-GT")}
                </p>
              ))
            ) : (
              <p>Sin pagos registrados.</p>
            )}
          </section>
        </>
      ) : null}
      {allowed && !f.administrative ? (
        <section className="ops-work-panel">
          <h2>
            {replace ? "Corregir rechazo mediante reemplazo" : "Preparar cobro"}
          </h2>
          <p>
            Preparar no registra dinero. El servidor fija el importe; la captura
            exige una confirmación separada. El efectivo requiere turno OPEN;
            tarjeta externa y transferencia solo registran cobros presenciales.
          </p>
          <fieldset disabled={!compose || f.sending || !f.ready}>
            <legend>Importes del pago</legend>
            <label className="cash-field">
              Método
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              >
                {paymentMethods.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="cash-field">
              Importe
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => setAmount(String(a?.balance ?? ""))}
            >
              Usar saldo completo
            </button>
            <label className="cash-field">
              Propina
              <input
                inputMode="decimal"
                value={tip}
                onChange={(e) => setTip(e.target.value)}
              />
            </label>
            {method === "CASH" ? (
              <label className="cash-field">
                Código de caja
                <input
                  maxLength={32}
                  value={register}
                  onChange={(e) => setRegister(e.target.value)}
                />
              </label>
            ) : null}
            <label className="cash-field">
              Referencia del cobro (opcional)
              <input
                maxLength={120}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </label>
            <p>No incluyas datos de tarjetas ni secretos.</p>
            {replace ? (
              <label className="cash-field">
                Motivo del reemplazo
                <textarea
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            ) : null}
            <button
              className="button button--primary"
              disabled={!valid || (replace && !reason.trim())}
              onClick={() => {
                const payload = input();
                if (payload)
                  void (replace
                    ? f.replace(payload, reason)
                    : f.prepare(payload));
              }}
            >
              {replace ? "Preparar reemplazo vinculado" : "Preparar importe"}
            </button>
          </fieldset>
          {!compose ? (
            <p>
              Consulta el contexto y los intentos antes de preparar; un
              resultado incierto no autoriza otra operación.
            </p>
          ) : null}
        </section>
      ) : !allowed ? (
        <p>
          Consulta financiera disponible. No tienes permiso para registrar
          cobros.
        </p>
      ) : null}
      {f.history.length && !f.administrative ? (
        <section className="ops-work-panel">
          <h2>Historial propio de la cuenta</h2>
          {f.history.map((item) => (
            <p key={item.attemptId}>
              {labels[item.status]} · {formatMoney(item.amount, item.currency)}{" "}
              ·{" "}
              <button
                className="button button--secondary"
                disabled={f.sending || f.uncertain}
                onClick={() => f.selectAttempt(item.attemptId)}
              >
                Seleccionar intento {item.attemptId}
              </button>
            </p>
          ))}
          {f.nextCursor ? (
            <button
              className="button button--secondary"
              onClick={() => void f.loadMore()}
            >
              Más intentos
            </button>
          ) : null}
        </section>
      ) : null}
      {dialog ? (
        <div className="confirm-dialog__backdrop">
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-confirm-title"
            onKeyDown={(e) =>
              containDialogKeys(e, () => {
                if (!f.sending) setDialog(null);
              })
            }
          >
            <h2 id="payment-confirm-title">
              {dialog.kind === "capture"
                ? "Confirmar captura del intento"
                : dialog.kind === "retire"
                  ? "Retirar preparación"
                  : "Confirmar resolución excepcional"}
            </h2>
            <p>
              Intento: {dialog.target.attemptId} · Versión{" "}
              {dialog.target.version}
            </p>
            <p>
              Importe congelado:{" "}
              {formatMoney(dialog.target.amount, dialog.target.currency)} ·
              Propina:{" "}
              {formatMoney(dialog.target.tipAmount, dialog.target.currency)} ·{" "}
              {dialog.target.method} · Caja: {dialog.target.registerCode}
            </p>
            {dialog.kind === "capture" ? (
              <p>
                Confirma el registro del dinero realmente recibido. Continuar no
                significa volver a pedir dinero. No se recalculará el saldo
                completo.
              </p>
            ) : dialog.kind === "retire" ? (
              <label className="cash-field">
                Motivo del retiro
                <textarea
                  value={reason}
                  maxLength={500}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            ) : (
              <>
                <p>
                  No encontrar una captura WOK y declarar dinero no recibido son
                  hechos distintos. Declaras por separado que no se recibió
                  dinero físicamente. La deuda y la solicitud original se
                  conservan; no marcas pagado.
                </p>
                <p>Motivo: {reason}</p>
                <p>
                  Evidencia: {evidence} {evidenceReference}
                </p>
              </>
            )}
            <div className="confirm-dialog__actions">
              <button
                className="button button--secondary"
                autoFocus
                disabled={f.sending}
                onClick={() => setDialog(null)}
              >
                Cancelar
              </button>
              <button
                className="button button--primary"
                disabled={
                  f.sending ||
                  f.blocked ||
                  (dialog.kind !== "capture" && !reason.trim()) ||
                  (dialog.kind === "resolve" &&
                    (physical !== "NOT_RECEIVED" || !evidence.trim()))
                }
                onClick={() => void confirm()}
              >
                {dialog.kind === "capture"
                  ? "Confirmar registro de pago"
                  : dialog.kind === "retire"
                    ? "Confirmar retiro no solicitado"
                    : "Confirmar retiro sin captura"}
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
        "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]",
      ),
    ),
    first = controls[0],
    last = controls.at(-1);
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
