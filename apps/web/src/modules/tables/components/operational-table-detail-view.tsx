"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { CircleAlert, ReceiptText, RefreshCw } from "lucide-react";
import { usePickupResource } from "@/modules/client-order-tracking/use-pickup-resource";
import {
  isOperationalTable,
  isOperationalTables,
} from "@/modules/tables/live-contract";
import { formatAccountStatus, formatTableAccount } from "../presentation";
import styles from "./operational-tables.module.css";
import {
  isAccountBalances,
  formatMoney,
} from "@/modules/payments/live-contract";
import { useFinancialAttempts } from "@/modules/payments/financial-attempt-provider";

const labels = {
  FREE: "Libre",
  OCCUPIED: "Ocupada",
  RESERVED: "Reservada",
  CLEANING: "En limpieza",
  UNAVAILABLE: "No disponible",
} as const;

function message(body: unknown) {
  return body &&
    typeof body === "object" &&
    "message" in body &&
    typeof body.message === "string"
    ? body.message
    : "No pudimos actualizar la mesa.";
}

export function OperationalTableDetailView({ tableId }: { tableId: string }) {
  const financial = usePickupResource(
    `/bff/operational/accounts?tableId=${encodeURIComponent(tableId)}`,
    isAccountBalances,
  );
  const { permissions } = useFinancialAttempts();
  const accountPermission = permissions.includes("accounts:manage");
  const financialRead =
    accountPermission || permissions.includes("payments:manage");
  const settled =
    financial.data !== null &&
    !financial.error &&
    financial.data.every(
      (a) =>
        a.currencies.length <= 1 &&
        a.currencyTotals.every((t) => t.balance === 0) &&
        a.pendingOrderCount === 0 &&
        a.unfinalizedOrderCount === 0,
    );
  const resource = usePickupResource(
    "/bff/operational/tables",
    isOperationalTables,
  );
  const inFlight = useRef(false);
  const [sending, setSending] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [confirmRelease, setConfirmRelease] = useState(false);

  const table = resource.data?.find((item) => item.id === tableId);

  async function action(kind: "open" | "close") {
    if (
      inFlight.current ||
      accessDenied ||
      !table ||
      !accountPermission ||
      (kind === "close" && !settled)
    )
      return;
    inFlight.current = true;
    setConfirmRelease(false);
    setSending(true);
    setError("");
    setFeedback("");
    try {
      const response = await fetch(
        `/bff/operational/tables/${table.id}/${kind}`,
        { method: "POST", headers: { "X-Request-Id": crypto.randomUUID() } },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 404 || response.status === 409) {
          setError(
            response.status === 404
              ? "La mesa ya no existe. Recargamos el listado."
              : `${message(body)} Recargamos el listado.`,
          );
          resource.reload();
          financial.reload();
          return;
        }
        if (response.status === 401 || response.status === 403) {
          setAccessDenied(true);
          setError(
            response.status === 401
              ? "Tu sesión venció. Inicia sesión nuevamente."
              : "No tienes permiso para actualizar esta mesa.",
          );
          resource.reload();
          financial.reload();
          return;
        }
        if (response.status >= 500) throw new Error("Resultado incierto");
        setError(message(body));
        return;
      }
      if (!isOperationalTable(body)) throw new Error("Respuesta inválida.");
      setFeedback(
        kind === "open"
          ? "Mesa abierta."
          : "Mesa cerrada y enviada a limpieza.",
      );
      resource.reload();
      financial.reload();
    } catch {
      setError(
        "No pudimos confirmar el resultado. Actualizamos la mesa antes de que vuelvas a operar.",
      );
      resource.reload();
      financial.reload();
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  const visibleError = error || resource.error?.message || "";
  if (!resource.data && !resource.error)
    return (
      <div className="ops-empty-state" role="status">
        <strong>Cargando mesa…</strong>
      </div>
    );
  if (resource.error)
    return (
      <ErrorState
        message={visibleError}
        reload={resource.reload}
        sending={sending}
      />
    );
  if (!table)
    return (
      <div className="ops-empty-state">
        <strong>Mesa no encontrada (404)</strong>
        <Link className="button button--secondary" href="/operation/tables">
          Volver a mesas
        </Link>
      </div>
    );

  const openable =
    table.active && (table.status === "FREE" || table.status === "CLEANING");
  const closable = table.status === "OCCUPIED";
  return (
    <div className={`ops-dashboard ${styles.root}`}>
      <header className="ops-page-header">
        <div>
          <Link className="text-action" href="/operation/tables">
            Volver a mesas
          </Link>
          <h1>{table.name}</h1>
          <p>
            {table.capacity} personas · {table.zone}
          </p>
        </div>
      </header>
      {feedback ? <p role="status">{feedback}</p> : null}
      {visibleError ? (
        <ErrorState
          message={visibleError}
          reload={resource.reload}
          sending={sending}
        />
      ) : null}
      <section className="ops-work-panel">
        <dl>
          <dt>Estado</dt>
          <dd>{labels[table.status]}</dd>
          <dt>Disponible</dt>
          <dd>{table.active ? "Sí" : "No"}</dd>
          <dt>Versión</dt>
          <dd>{table.rowVersion}</dd>
          <dt>Última actualización</dt>
          <dd>
            {new Intl.DateTimeFormat("es-GT", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(table.updatedAt))}
          </dd>
          <dt>Cuenta</dt>
          <dd>{formatTableAccount(table)}</dd>
        </dl>
        <div className={styles.actions}>
          {table.accountId ? (
            <Link
              className="button button--primary"
              href={`/operation/orders/new?account=${encodeURIComponent(table.accountId)}&accountName=${encodeURIComponent(table.accountName ?? "Cuenta principal")}`}
            >
              <ReceiptText aria-hidden="true" size={17} /> Tomar pedido
            </Link>
          ) : null}
          <button
            className="button button--primary"
            disabled={
              sending || accessDenied || !openable || !accountPermission
            }
            onClick={() => void action("open")}
            type="button"
          >
            {sending ? "Guardando…" : "Abrir mesa"}
          </button>
          <button
            className="button button--secondary"
            disabled={
              sending ||
              accessDenied ||
              !closable ||
              !accountPermission ||
              !settled
            }
            onClick={() => setConfirmRelease(true)}
            type="button"
          >
            {sending ? "Guardando…" : "Finalizar cuentas y liberar mesa"}
          </button>
        </div>
      </section>
      {confirmRelease ? (
        <div className="confirm-dialog__backdrop">
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            onKeyDown={(e) =>
              containDialogKeys(e, () => {
                if (!sending) setConfirmRelease(false);
              })
            }
            aria-labelledby="release-title"
          >
            <h2 id="release-title">Confirmar liberación de {table.name}</h2>
            <p>
              Se finalizarán todas las cuentas con saldo cero y pedidos
              finalizados. La mesa pasará a limpieza.
            </p>
            <div className="confirm-dialog__actions">
              <button
                className="button button--secondary"
                autoFocus
                onClick={() => setConfirmRelease(false)}
              >
                Volver sin liberar
              </button>
              <button
                className="button button--primary"
                disabled={
                  sending || accessDenied || !settled || !accountPermission
                }
                onClick={() => void action("close")}
              >
                Confirmar liberación
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {financialRead ? (
        <section className="ops-work-panel">
          <h2>Todas las cuentas de la mesa</h2>
          <button
            className="button button--secondary"
            onClick={financial.reload}
          >
            Actualizar cuentas
          </button>
          {financial.error ? (
            <p role="alert">{financial.error.message}</p>
          ) : null}
          {!financial.data && !financial.error ? (
            <p role="status">Consultando todas las cuentas…</p>
          ) : null}
          {financial.data?.map((a) => (
            <div key={a.account.id}>
              <h3>
                {a.account.name} · {formatAccountStatus(a.account.status)}
              </h3>
              {a.currencyTotals.map((t) => (
                <p key={t.currency}>
                  Saldo: {formatMoney(t.balance, t.currency)}
                </p>
              ))}
              <p>{a.unfinalizedOrderCount} pedidos sin finalizar</p>
              <Link
                className="button button--secondary"
                href={`/operation/payments/${a.account.id}`}
              >
                Cuenta y precuenta
              </Link>
            </div>
          ))}
          {!settled ? (
            <p>
              La liberación exige saldo cero y pedidos finalizados en todas las
              cuentas. El servidor vuelve a comprobarlo al liberar.
            </p>
          ) : null}
        </section>
      ) : null}
      <section className="ops-work-panel" aria-labelledby="unavailable-actions">
        <h2 id="unavailable-actions">Acciones no disponibles</h2>
        <p>Estas acciones aún no están disponibles en esta pantalla.</p>
        <div className={styles.unavailable}>
          {[
            "Unir o separar mesas",
            "Asignar reserva",
            "Trasladar mesa",
            "Dividir cuenta",
            "Marcar limpia como libre",
            "Abrir atención presencial",
          ].map((item) => (
            <button disabled key={item} type="button">
              {item}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function ErrorState({
  message,
  reload,
  sending,
}: {
  message: string;
  reload: () => void;
  sending: boolean;
}) {
  return (
    <div className="ops-inline-feedback" role="alert">
      <CircleAlert aria-hidden="true" size={18} />
      <span>{message}</span>
      <button
        className="button button--secondary button--compact"
        disabled={sending}
        onClick={reload}
        type="button"
      >
        <RefreshCw aria-hidden="true" size={16} /> Actualizar
      </button>
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
      "button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]",
    ),
  );
  const first = controls[0],
    last = controls[controls.length - 1];
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
