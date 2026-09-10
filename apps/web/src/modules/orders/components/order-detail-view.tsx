"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  ChefHat,
  Clock3,
  Minus,
  Pencil,
  Plus,
  Send,
  Trash2,
  X,
} from "lucide-react";
import {
  getOrderTotal,
  type OrderItem,
  type OrderStatus,
} from "@/data/fixtures/orders";
import { useOrderSession } from "../order-session-provider";

const statusMeta: Record<
  OrderStatus,
  { label: string; tone: string; description: string; icon: typeof Clock3 }
> = {
  new: {
    label: "No comandado",
    tone: "info",
    description: "Aún no se ha enviado a cocina.",
    icon: Clock3,
  },
  sent: {
    label: "Comandado",
    tone: "neutral",
    description: "Cocina recibió la comanda y debe aceptarla.",
    icon: Send,
  },
  preparing: {
    label: "En preparación",
    tone: "warning",
    description: "Cocina ya está trabajando este pedido.",
    icon: ChefHat,
  },
  ready: {
    label: "Listo",
    tone: "success",
    description: "El pedido está listo para entregar.",
    icon: CheckCircle2,
  },
  delayed: {
    label: "Retrasado",
    tone: "danger",
    description: "El tiempo estimado fue superado.",
    icon: AlertTriangle,
  },
  cancelled: {
    label: "Anulado",
    tone: "muted",
    description: "El pedido fue anulado y no admite más cambios.",
    icon: Ban,
  },
};

export function OrderDetailView({ orderId }: { orderId: string }) {
  const { orders, updateOrderItems, updateOrderStatus } = useOrderSession();
  const order = orders.find((item) => item.id === orderId);
  const [draftItems, setDraftItems] = useState<OrderItem[]>(order?.items ?? []);
  const [editing, setEditing] = useState(false);
  const [confirmingChanges, setConfirmingChanges] = useState(false);
  const [confirmingCancellation, setConfirmingCancellation] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [feedback, setFeedback] = useState("");

  if (!order) {
    return (
      <div className="orders-page">
        <Link className="text-action" href="/operation/orders">
          <ArrowLeft aria-hidden="true" size={16} /> Volver a pedidos
        </Link>
        <div className="ops-empty-state order-not-found">
          <strong>Este pedido no está disponible</strong>
          <span>Puede haberse reiniciado al recargar los datos simulados.</span>
        </div>
      </div>
    );
  }

  const status = statusMeta[order.status];
  const StatusIcon = status.icon;
  const isClosed = order.status === "cancelled";
  const canEdit = order.status !== "ready" && !isClosed;
  const displayedItems = editing ? draftItems : order.items;
  const total = getOrderTotal(displayedItems);
  const originalTotal = getOrderTotal(order.items);
  const hasChanges = JSON.stringify(draftItems) !== JSON.stringify(order.items);

  const changeQuantity = (itemId: string, amount: number) => {
    setDraftItems((current) =>
      current
        .map((item) =>
          item.id === itemId
            ? { ...item, quantity: Math.max(0, item.quantity + amount) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  };

  const saveChanges = () => {
    if (draftItems.length === 0) return;
    updateOrderItems(order.id, draftItems);
    setEditing(false);
    setConfirmingChanges(false);
    setFeedback(
      order.status === "new"
        ? "Cambios guardados en la comanda."
        : "Actualización enviada a cocina con trazabilidad simulada.",
    );
  };

  const cancelEditing = () => {
    setDraftItems(order.items);
    setEditing(false);
  };

  const startEditing = () => {
    setDraftItems(order.items);
    setEditing(true);
  };

  const cancelOrder = () => {
    if (!cancellationReason) return;
    updateOrderStatus(order.id, "cancelled");
    setConfirmingCancellation(false);
    setFeedback(`Pedido anulado. Motivo registrado: ${cancellationReason}.`);
  };

  const advanceOrder = () => {
    const nextStatus: OrderStatus = order.status === "new" ? "sent" : "ready";
    updateOrderStatus(order.id, nextStatus);
    setFeedback(
      nextStatus === "sent"
        ? "Comanda enviada a cocina."
        : "Pedido marcado como listo.",
    );
  };

  return (
    <div className="orders-page order-detail">
      <header className="ops-page-header orders-page__header">
        <div>
          <Link className="text-action" href="/operation/orders">
            <ArrowLeft aria-hidden="true" size={16} /> Volver a pedidos
          </Link>
          <span className="ops-kicker">Detalle de comanda</span>
          <h1>Pedido #{order.id}</h1>
          <p>{order.source}</p>
        </div>
        <span
          className={`order-status order-status--${status.tone} order-status--large`}
        >
          <StatusIcon aria-hidden="true" size={18} /> {status.label}
        </span>
      </header>

      {feedback ? (
        <div className="ops-inline-feedback" role="status">
          <CheckCircle2 aria-hidden="true" size={18} /> {feedback}
        </div>
      ) : null}

      <section
        className={`order-state-strip order-state-strip--${status.tone}`}
      >
        <StatusIcon aria-hidden="true" size={21} />
        <div>
          <strong>{status.label}</strong>
          <span>{status.description}</span>
        </div>
        <strong>{order.eta}</strong>
      </section>

      <section
        className="order-detail__summary"
        aria-label="Resumen del pedido"
      >
        <div>
          <span>Creado</span>
          <strong>{order.createdAt}</strong>
        </div>
        <div>
          <span>Responsable</span>
          <strong>{order.responsible}</strong>
        </div>
        <div>
          <span>Productos</span>
          <strong>
            {order.items.reduce((sum, item) => sum + item.quantity, 0)}
          </strong>
        </div>
        <div>
          <span>Actualizaciones</span>
          <strong>{order.kitchenUpdates}</strong>
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
              <p>
                {editing
                  ? "Ajusta cantidades antes de enviar el cambio."
                  : "Comanda registrada"}
              </p>
            </div>
            {canEdit && !editing ? (
              <button
                className="button button--secondary button--compact"
                onClick={startEditing}
                type="button"
              >
                <Pencil aria-hidden="true" size={16} /> Editar
              </button>
            ) : null}
          </div>

          <div className="order-detail__item-list">
            {displayedItems.map((item) => (
              <div className="order-detail-item" key={item.id}>
                <span className="order-detail-item__quantity">
                  {item.quantity}×
                </span>
                <div>
                  <strong>{item.name}</strong>
                  {item.modifiers.length > 0 ? (
                    <span>{item.modifiers.join(" · ")}</span>
                  ) : null}
                  {item.notes ? <small>Nota: {item.notes}</small> : null}
                </div>
                {editing ? (
                  <div className="quantity-control">
                    <button
                      aria-label={`Restar ${item.name}`}
                      onClick={() => changeQuantity(item.id, -1)}
                      type="button"
                    >
                      <Minus aria-hidden="true" size={15} />
                    </button>
                    <span>{item.quantity}</span>
                    <button
                      aria-label={`Sumar ${item.name}`}
                      onClick={() => changeQuantity(item.id, 1)}
                      type="button"
                    >
                      <Plus aria-hidden="true" size={15} />
                    </button>
                    <button
                      aria-label={`Quitar ${item.name}`}
                      className="quantity-control__remove"
                      onClick={() =>
                        setDraftItems((current) =>
                          current.filter((entry) => entry.id !== item.id),
                        )
                      }
                      type="button"
                    >
                      <Trash2 aria-hidden="true" size={15} />
                    </button>
                  </div>
                ) : (
                  <strong>
                    Q {(item.unitPrice * item.quantity).toFixed(2)}
                  </strong>
                )}
              </div>
            ))}
          </div>

          {draftItems.length === 0 ? (
            <div className="ops-empty-state">
              <strong>La comanda no puede quedar vacía</strong>
              <span>Cancela la edición o conserva al menos un producto.</span>
            </div>
          ) : null}

          {editing ? (
            <div className="order-edit-bar">
              <div>
                <span>Cambio en el total</span>
                <strong>
                  Q {originalTotal.toFixed(2)} → Q {total.toFixed(2)}
                </strong>
              </div>
              <button
                className="button button--secondary"
                onClick={cancelEditing}
                type="button"
              >
                Descartar
              </button>
              <button
                className="button button--primary"
                disabled={!hasChanges || draftItems.length === 0}
                onClick={() => setConfirmingChanges(true)}
                type="button"
              >
                <Send aria-hidden="true" size={17} />
                {order.status === "new" ? "Guardar cambios" : "Enviar cambio"}
              </button>
            </div>
          ) : (
            <div className="order-detail__total">
              <span>Total</span>
              <strong>Q {originalTotal.toFixed(2)}</strong>
            </div>
          )}
        </section>

        <aside className="order-actions" aria-labelledby="order-actions-title">
          <div>
            <span>Acciones</span>
            <h2 id="order-actions-title">Gestionar pedido</h2>
          </div>
          {!isClosed && order.status !== "ready" ? (
            <button
              className="button button--primary button--full"
              onClick={advanceOrder}
              type="button"
            >
              {order.status === "new" ? (
                <>
                  <Send aria-hidden="true" size={18} /> Enviar a cocina
                </>
              ) : (
                <>
                  <CheckCircle2 aria-hidden="true" size={18} /> Marcar como
                  listo
                </>
              )}
            </button>
          ) : null}
          {!isClosed ? (
            <button
              className="button button--danger button--full"
              onClick={() => setConfirmingCancellation(true)}
              type="button"
            >
              <Ban aria-hidden="true" size={18} /> Anular pedido
            </button>
          ) : null}
          <div className="order-trace">
            <strong>Trazabilidad simulada</strong>
            <span>{order.createdAt} · Pedido creado</span>
            {order.status !== "new" ? (
              <span>{order.createdAt} · Enviado a cocina</span>
            ) : null}
            {order.kitchenUpdates > 0 ? (
              <span>
                {order.kitchenUpdates} actualización(es) registrada(s)
              </span>
            ) : null}
          </div>
        </aside>
      </div>

      <p className="mock-disclaimer">
        Las acciones cambian únicamente el estado local hasta integrar backend y
        permisos.
      </p>

      {confirmingChanges ? (
        <div className="confirm-dialog__backdrop" role="presentation">
          <section
            aria-labelledby="confirm-order-change-title"
            aria-modal="true"
            className="confirm-dialog"
            role="dialog"
          >
            <button
              aria-label="Cerrar confirmación"
              className="icon-button confirm-dialog__close"
              onClick={() => setConfirmingChanges(false)}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
            <span className="confirm-dialog__icon">
              <Send aria-hidden="true" size={22} />
            </span>
            <h2 id="confirm-order-change-title">
              {order.status === "new"
                ? "Guardar cambios"
                : "Actualizar comanda"}
            </h2>
            <p>
              {order.status === "new"
                ? "Los cambios quedarán listos antes de enviar el pedido."
                : "Cocina recibirá una actualización separada para conservar la trazabilidad."}
            </p>
            <div className="confirm-dialog__actions">
              <button
                className="button button--secondary"
                onClick={() => setConfirmingChanges(false)}
                type="button"
              >
                Volver
              </button>
              <button
                className="button button--primary"
                onClick={saveChanges}
                type="button"
              >
                Confirmar cambio
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {confirmingCancellation ? (
        <div className="confirm-dialog__backdrop" role="presentation">
          <section
            aria-labelledby="cancel-order-title"
            aria-modal="true"
            className="confirm-dialog"
            role="dialog"
          >
            <button
              aria-label="Cerrar confirmación"
              className="icon-button confirm-dialog__close"
              onClick={() => setConfirmingCancellation(false)}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
            <span className="confirm-dialog__icon confirm-dialog__icon--danger">
              <Ban aria-hidden="true" size={22} />
            </span>
            <h2 id="cancel-order-title">Anular pedido #{order.id}</h2>
            <p>
              La acción requiere un motivo y debe validarse en backend antes de
              afectar cocina.
            </p>
            <label className="order-field">
              <span>Motivo de anulación</span>
              <select
                onChange={(event) => setCancellationReason(event.target.value)}
                value={cancellationReason}
              >
                <option value="">Seleccionar motivo</option>
                <option value="Solicitud del cliente">
                  Solicitud del cliente
                </option>
                <option value="Error en la comanda">Error en la comanda</option>
                <option value="Producto no disponible">
                  Producto no disponible
                </option>
              </select>
            </label>
            <div className="confirm-dialog__actions">
              <button
                className="button button--secondary"
                onClick={() => setConfirmingCancellation(false)}
                type="button"
              >
                Volver
              </button>
              <button
                className="button button--danger"
                disabled={!cancellationReason}
                onClick={cancelOrder}
                type="button"
              >
                Confirmar anulación
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
