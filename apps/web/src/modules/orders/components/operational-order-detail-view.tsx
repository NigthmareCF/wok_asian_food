"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  ArrowLeft,
  Ban,
  Check,
  CircleAlert,
  Package,
  Plus,
  RefreshCw,
  Utensils,
} from "lucide-react";
import { usePickupResource } from "@/modules/client-order-tracking/use-pickup-resource";
import { isAccountDetails } from "@/modules/payments/live-contract";
import { useFinancialAttempts } from "@/modules/payments/financial-attempt-provider";
import {
  isOperationalOrderDetails,
  isOperationalOrderSummary,
  type OperationalOrderStatus,
} from "../live-contract";

const labels: Record<OperationalOrderStatus, string> = {
  SENT: "Enviado a cocina",
  PREPARING: "En preparación",
  READY: "Listo",
  SERVED: "Servido",
  CLOSED: "Cerrado",
  CANCELLED: "Anulado",
};

export function OperationalOrderDetailView({ orderId }: { orderId: string }) {
  const { permissions } = useFinancialAttempts();
  const resource = usePickupResource(
    `/bff/operational/orders/${orderId}`,
    isOperationalOrderDetails,
    10_000,
  );
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const latch = useRef(false);
  const details = resource.data;

  async function changeStatus(status: OperationalOrderStatus) {
    if (
      !details ||
      latch.current ||
      pending ||
      !permissions.includes("orders:manage")
    )
      return;
    latch.current = true;
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/bff/operational/orders/${orderId}/status`,
        {
          method: "PATCH",
          signal: AbortSignal.timeout(15000),
          headers: {
            "Content-Type": "application/json",
            "X-Request-Id": crypto.randomUUID(),
          },
          body: JSON.stringify({
            status,
            expectedVersion: details.order.rowVersion,
            ...(status === "CANCELLED"
              ? { reason: "Solicitud operativa" }
              : {}),
          }),
        },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          body &&
          typeof body === "object" &&
          "message" in body &&
          typeof body.message === "string"
            ? body.message
            : "No pudimos actualizar el pedido.";
        throw new Error(message);
      }
      if (!isOperationalOrderSummary(body))
        throw new Error("Respuesta inválida del pedido.");
      setFeedback(
        `Pedido actualizado a ${labels[status].toLocaleLowerCase("es")}.`,
      );
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "No pudimos actualizar el pedido.",
      );
    } finally {
      resource.reload();
      latch.current = false;
      setPending(false);
    }
  }

  if (resource.error)
    return (
      <div className="orders-page order-not-found">
        <Link className="text-action" href="/operation/orders">
          <ArrowLeft aria-hidden="true" size={16} /> Volver a pedidos
        </Link>
        <div className="ops-empty-state">
          <CircleAlert aria-hidden="true" size={24} />
          <strong>No pudimos abrir el pedido</strong>
          <span>{resource.error.message}</span>
          <button
            className="button button--secondary"
            onClick={resource.reload}
            type="button"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  if (!details)
    return (
      <div className="orders-page">
        <p>Cargando pedido...</p>
      </div>
    );

  const order = details.order;
  const nextStatus =
    order.status === "READY"
      ? "SERVED"
      : order.status === "SERVED"
        ? "CLOSED"
        : null;
  const canCancel = ["SENT", "PREPARING", "READY"].includes(order.status);

  return (
    <div className="orders-page">
      <header className="ops-page-header orders-page__header">
        <div>
          <Link className="text-action" href="/operation/orders">
            <ArrowLeft aria-hidden="true" size={16} /> Volver a pedidos
          </Link>
          <span className="ops-kicker">Pedido operativo</span>
          <h1>{order.code}</h1>
          <p>{order.diningTableName ?? order.accountName}</p>
        </div>
        <span className="order-status order-status--large">
          {labels[order.status]}
        </span>
      </header>

      {feedback ? (
        <div
          className="order-state-strip order-state-strip--info"
          role="status"
        >
          <Check aria-hidden="true" size={20} />
          <div>
            <strong>Estado del pedido</strong>
            <span>{feedback}</span>
          </div>
        </div>
      ) : null}

      <section
        className="order-detail__summary"
        aria-label="Resumen del pedido"
      >
        <div>
          <span>Canal</span>
          <strong>
            {order.channel === "DINE_IN"
              ? "Mesa"
              : order.channel === "PICKUP"
                ? "Para recoger"
                : "Delivery"}
          </strong>
        </div>
        <div>
          <span>Cuenta</span>
          <strong>{order.accountName}</strong>
        </div>
        <div>
          <span>Personas</span>
          <strong>{order.guestCount}</strong>
        </div>
        <div>
          <span>Total</span>
          <strong>
            {order.currency} {order.total.toFixed(2)}
          </strong>
        </div>
      </section>

      <div className="order-detail__layout">
        <section
          className="order-detail__items"
          aria-labelledby="order-items-title"
        >
          <div className="ops-section-heading">
            <div>
              <h2 id="order-items-title">Productos</h2>
              <p>{details.items.length} líneas persistidas</p>
            </div>
          </div>
          <div className="order-detail__item-list">
            {details.items.map((item) => (
              <div className="order-detail-item" key={item.id}>
                <span className="order-detail-item__quantity">
                  {item.quantity}×
                </span>
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.stationCode}</span>
                  {item.notes ? <small>Nota: {item.notes}</small> : null}
                  {item.fulfillment === "TAKEAWAY" ? (
                    <small className="order-detail-item__takeaway">
                      <Package aria-hidden="true" size={13} /> Para llevar
                    </small>
                  ) : null}
                </div>
                <strong>
                  {order.currency} {item.lineTotal.toFixed(2)}
                </strong>
              </div>
            ))}
          </div>
          <div className="order-detail__total">
            <span>Total</span>
            <strong>
              {order.currency} {order.total.toFixed(2)}
            </strong>
          </div>
        </section>

        <aside className="order-actions" aria-labelledby="order-actions-title">
          <div>
            <span>Acciones</span>
            <h2 id="order-actions-title">Gestionar pedido</h2>
          </div>
          {!["CLOSED", "CANCELLED"].includes(order.status) ? (
            <Link
              className="button button--secondary button--full"
              href={`/operation/orders/new?account=${encodeURIComponent(order.accountId)}&accountName=${encodeURIComponent(order.accountName)}&orderId=${encodeURIComponent(order.id)}`}
            >
              <Plus aria-hidden="true" size={17} /> Agregar productos
            </Link>
          ) : null}
          {nextStatus === "CLOSED" ? (
            <FinalizeOrderControl
              key={order.accountId}
              accountId={order.accountId}
              pending={pending}
              allowed={permissions.includes("orders:manage")}
              finalize={() => void changeStatus("CLOSED")}
            />
          ) : nextStatus ? (
            <button
              className="button button--primary button--full"
              disabled={pending || !permissions.includes("orders:manage")}
              onClick={() => void changeStatus(nextStatus)}
              type="button"
            >
              <Utensils aria-hidden="true" size={18} />{" "}
              {nextStatus === "SERVED" ? "Marcar servido" : "Cerrar pedido"}
            </button>
          ) : null}
          {permissions.includes("accounts:manage") ||
          permissions.includes("payments:manage") ? (
            <Link
              className="button button--secondary button--full"
              href={`/operation/payments/${order.accountId}`}
            >
              Cuenta, precuenta y pagos
            </Link>
          ) : null}
          {canCancel ? (
            <button
              className="button button--danger button--full"
              disabled={pending || !permissions.includes("orders:manage")}
              onClick={() => void changeStatus("CANCELLED")}
              type="button"
            >
              <Ban aria-hidden="true" size={18} /> Anular pedido
            </button>
          ) : null}
          <button
            className="button button--secondary button--full"
            disabled={pending}
            onClick={resource.reload}
            type="button"
          >
            <RefreshCw aria-hidden="true" size={17} /> Actualizar
          </button>
          <div className="order-trace">
            <strong>Comandas de cocina</strong>
            {details.tickets.map((ticket) => (
              <span key={ticket.id}>
                #{ticket.sequence} · {ticket.stationCode} · {ticket.status}
              </span>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function FinalizeOrderControl({
  accountId,
  pending,
  allowed,
  finalize,
}: {
  accountId: string;
  pending: boolean;
  allowed: boolean;
  finalize: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const finance = usePickupResource(
    `/bff/operational/accounts/${accountId}`,
    isAccountDetails,
  );
  const data = finance.data;
  const settled =
    !!data &&
    !finance.error &&
    data.currencies.length <= 1 &&
    data.currencyTotals.every((t) => t.balance === 0) &&
    data.pendingOrderCount === 0;
  return (
    <div>
      <button
        className="button button--primary button--full"
        disabled={pending || !allowed || !settled}
        onClick={() => setConfirm(true)}
      >
        Finalizar pedido con saldo cero
      </button>
      {!settled ? (
        <p>
          Primero deben servirse todos los pedidos y cobrarse el saldo completo
          de esta cuenta.
        </p>
      ) : null}
      {finance.error ? <p role="alert">{finance.error.message}</p> : null}
      <button
        className="button button--secondary button--full"
        onClick={finance.reload}
        disabled={pending}
      >
        Actualizar verificación financiera
      </button>
      {confirm ? (
        <div className="confirm-dialog__backdrop">
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            onKeyDown={(e) =>
              containDialogKeys(e, () => {
                if (!pending) setConfirm(false);
              })
            }
            aria-labelledby="finalize-title"
          >
            <h2 id="finalize-title">Confirmar finalización del pedido</h2>
            <p>
              El pedido servido se finalizará financieramente. Esta acción no
              libera la mesa.
            </p>
            <div className="confirm-dialog__actions">
              <button
                className="button button--secondary"
                autoFocus
                onClick={() => setConfirm(false)}
              >
                Volver sin finalizar
              </button>
              <button
                className="button button--primary"
                disabled={pending || !settled || !allowed}
                onClick={() => {
                  setConfirm(false);
                  finalize();
                }}
              >
                Confirmar finalización
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
