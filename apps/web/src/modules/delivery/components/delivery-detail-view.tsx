"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bike,
  CheckCircle2,
  CircleDot,
  Clock3,
  MapPin,
  Package,
  Phone,
  Send,
  Sparkles,
  Truck,
  User,
  X,
} from "lucide-react";
import {
  deliveryOrders,
  deliveryStatusMeta,
  formatGTQ,
  type DeliveryOrderStatus,
} from "@/data/fixtures/delivery";
import { useDeliverySession } from "../delivery-session-provider";
import { deliveryDrivers } from "@/data/fixtures/delivery";

export function DeliveryDetailView({ orderId }: { orderId: string }) {
  const { orders, drivers, updateDeliveryStatus, assignDriver } = useDeliverySession();
  const order = orders.find((item) => item.id === orderId);
  const [showDriverPicker, setShowDriverPicker] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [feedback, setFeedback] = useState("");

  if (!order) {
    return (
      <div className="delivery-page">
        <Link className="text-action" href="/operation/delivery">
          <ArrowLeft aria-hidden="true" size={16} /> Volver a delivery
        </Link>
        <div className="ops-empty-state order-not-found">
          <strong>Este pedido no está disponible</strong>
          <span>Puede haberse reiniciado al recargar los datos simulados.</span>
        </div>
      </div>
    );
  }

  const status = deliveryStatusMeta[order.status];
  const StatusIcon = {
    waiting: Clock3,
    "driver-assigned": Bike,
    "picked-up": Truck,
    delivered: CheckCircle2,
    rescheduled: CircleDot,
    cancelled: X,
  }[order.status];
  const isClosed = order.status === "delivered" || order.status === "cancelled";
  const availableDrivers = drivers.filter((d) => d.status === "available");

  const assignDriverToOrder = (driverId: string) => {
    const result = assignDriver({ orderId, driverId });
    if (result) {
      setFeedback(`Repartidor asignado. Estado actualizado a "${deliveryStatusMeta["driver-assigned"].label}".`);
      setShowDriverPicker(false);
    }
  };

  const advanceStatus = (newStatus: DeliveryOrderStatus) => {
    const result = updateDeliveryStatus({ orderId, status: newStatus });
    if (result) {
      setFeedback(`Estado actualizado a "${deliveryStatusMeta[newStatus].label}".`);
    }
  };

  const rescheduleOrder = () => {
    if (!rescheduleTime) return;
    updateDeliveryStatus({ orderId, status: "rescheduled" });
    setFeedback(`Entrega reprogramada para ${rescheduleTime}.`);
    setShowReschedule(false);
    setRescheduleTime("");
  };

  const canAssignDriver = order.status === "waiting" && availableDrivers.length > 0;
  const canMarkPickedUp = order.status === "driver-assigned";
  const canMarkDelivered = order.status === "picked-up";
  const canReschedule = !isClosed;

  return (
    <div className="delivery-page delivery-detail">
      <header className="ops-page-header delivery-page__header">
        <div>
          <Link className="text-action" href="/operation/delivery">
            <ArrowLeft aria-hidden="true" size={16} /> Volver a delivery
          </Link>
          <span className="ops-kicker">Detalle de entrega</span>
          <h1>Delivery #{order.id}</h1>
          <p>{order.customer}</p>
        </div>
        <span className={`delivery-status delivery-status--${status.tone} delivery-status--large`}>
          <StatusIcon aria-hidden="true" size={18} /> {status.label}
        </span>
      </header>

      {feedback ? (
        <div className="ops-inline-feedback" role="status">
          <CheckCircle2 aria-hidden="true" size={18} /> {feedback}
        </div>
      ) : null}

      {order.isDemo ? (
        <div className="delivery-demo-strip" role="note">
          <Sparkles aria-hidden="true" size={18} />
          <div>
            <strong>Flujo desde cero</strong>
            <span>
              Pedido creado sin entregar: asigna un repartidor, marca recogido y
              luego entregado para recorrer todo el flujo.
            </span>
          </div>
        </div>
      ) : null}

      <section className={`delivery-state-strip delivery-state-strip--${status.tone}`}>
        <StatusIcon aria-hidden="true" size={21} />
        <div>
          <strong>{status.label}</strong>
          <span>{status.description}</span>
        </div>
        <strong>{order.eta}</strong>
      </section>

      <section className="delivery-detail__summary" aria-label="Resumen del delivery">
        <div>
          <span>Creado</span>
          <strong>{order.createdAt}</strong>
        </div>
        <div>
          <span>Dirección</span>
          <strong>{order.address}</strong>
        </div>
        <div>
          <span>Teléfono</span>
          <strong>{order.phone}</strong>
        </div>
        <div>
          <span>Método de pago</span>
          <strong>
            {order.paymentMethod === "cash"
              ? "Efectivo"
              : order.paymentMethod === "card"
              ? "Tarjeta"
              : "En línea"}
          </strong>
        </div>
        <div>
          <span>Estado del pago</span>
          <strong className={order.paymentStatus === "pending" ? "text-warning" : "text-success"}>
            {order.paymentStatus === "pending" ? "Pendiente" : "Cobrado"}
          </strong>
        </div>
      </section>

      {order.driver && (
        <section className="delivery-driver-strip" aria-label="Repartidor asignado">
          <Bike aria-hidden="true" size={19} />
          <div>
            <span>Repartidor</span>
            <strong>{order.driver}</strong>
          </div>
          <div>
            <span>Vehículo</span>
            <strong>{order.vehicle}</strong>
          </div>
          <div>
            <span>Teléfono</span>
            <strong>{order.driverPhone}</strong>
          </div>
        </section>
      )}

      <div className="delivery-detail__layout">
        <section className="delivery-detail__items" aria-labelledby="delivery-items-title">
          <div className="ops-section-heading">
            <div>
              <h2 id="delivery-items-title">Productos</h2>
              <p>Comanda registrada para entrega</p>
            </div>
          </div>

          <div className="delivery-detail__item-list">
            {order.items.map((item) => (
              <div className="delivery-detail-item" key={item.id}>
                <span className="delivery-detail-item__quantity">
                  {item.quantity}×
                </span>
                <div>
                  <strong>{item.name}</strong>
                  {item.modifiers?.length ? (
                    <span>{item.modifiers.join(" · ")}</span>
                  ) : null}
                </div>
                <strong>{formatGTQ(item.unitPrice * item.quantity)}</strong>
              </div>
            ))}
          </div>

          <div className="delivery-detail__total">
            <span>Total</span>
            <strong>{formatGTQ(order.total)}</strong>
          </div>

          {order.notes ? (
            <div className="delivery-notes">
              <AlertTriangle aria-hidden="true" size={16} />
              <span>{order.notes}</span>
            </div>
          ) : null}
        </section>

        <aside className="delivery-actions" aria-labelledby="delivery-actions-title">
          <div>
            <span>Acciones</span>
            <h2 id="delivery-actions-title">Gestionar entrega</h2>
          </div>

          {!isClosed && order.status === "waiting" && availableDrivers.length > 0 ? (
            <button
              className="button button--primary button--full"
              onClick={() => setShowDriverPicker(true)}
              type="button"
            >
              <Bike aria-hidden="true" size={18} /> Asignar repartidor ({availableDrivers.length} disponibles)
            </button>
          ) : null}

          {!isClosed && canMarkPickedUp ? (
            <button
              className="button button--primary button--full"
              onClick={() => advanceStatus("picked-up")}
              type="button"
            >
              <Truck aria-hidden="true" size={18} /> Marcar como recogido
            </button>
          ) : null}

          {!isClosed && canMarkDelivered ? (
            <button
              className="button button--success button--full"
              onClick={() => advanceStatus("delivered")}
              type="button"
            >
              <CheckCircle2 aria-hidden="true" size={18} /> Marcar como entregado
            </button>
          ) : null}

          {!isClosed && canReschedule ? (
            <button
              className="button button--secondary button--full"
              onClick={() => setShowReschedule(true)}
              type="button"
            >
              <Clock3 aria-hidden="true" size={18} /> Reprogramar entrega
            </button>
          ) : null}

          {!isClosed ? (
            <button
              className="button button--danger button--full"
              onClick={() => {
                updateDeliveryStatus({ orderId, status: "cancelled" });
                setFeedback("Entrega cancelada.");
              }}
              type="button"
            >
              <X aria-hidden="true" size={18} /> Cancelar entrega
            </button>
          ) : null}

          <div className="delivery-trace">
            <strong>Trazabilidad simulada</strong>
            <span>{order.createdAt} · Pedido creado</span>
            {order.status !== "waiting" && order.driver ? (
              <span>{order.createdAt} · Repartidor asignado: {order.driver}</span>
            ) : null}
            {order.status === "picked-up" ? (
              <span>{order.createdAt} · Recogido por repartidor</span>
            ) : null}
            {order.status === "delivered" ? (
              <span>{order.createdAt} · Entregado al cliente</span>
            ) : null}
            {order.status === "rescheduled" ? (
              <span>{order.createdAt} · Reprogramado</span>
            ) : null}
            {order.status === "cancelled" ? (
              <span>{order.createdAt} · Cancelado</span>
            ) : null}
          </div>
        </aside>
      </div>

      <p className="mock-disclaimer">
        Las acciones cambian únicamente el estado local hasta integrar backend y permisos.
      </p>

      {showDriverPicker ? (
        <div className="confirm-dialog__backdrop" role="presentation">
          <section
            aria-labelledby="driver-picker-title"
            aria-modal="true"
            className="confirm-dialog driver-picker"
            role="dialog"
          >
            <button
              aria-label="Cerrar selección"
              className="icon-button confirm-dialog__close"
              onClick={() => setShowDriverPicker(false)}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
            <span className="confirm-dialog__icon">
              <Bike aria-hidden="true" size={22} />
            </span>
            <h2 id="driver-picker-title">Repartidores disponibles</h2>
            <p>Selecciona un repartidor para asignar a este delivery.</p>
            <div className="driver-picker__list">
              {availableDrivers.map((driver) => (
                <button
                  className="driver-picker__item"
                  key={driver.id}
                  onClick={() => assignDriverToOrder(driver.id)}
                  type="button"
                >
                  <div>
                    <strong>{driver.name}</strong>
                    <small>{driver.vehicle}</small>
                  </div>
                  <Phone aria-hidden="true" size={18} />
                </button>
              ))}
              {availableDrivers.length === 0 ? (
                <div className="ops-empty-state">
                  <strong>No hay repartidores disponibles</strong>
                  <span>Todos los repartidores están en entrega o desconectados.</span>
                </div>
              ) : null}
            </div>
            <div className="confirm-dialog__actions">
              <button
                className="button button--secondary"
                onClick={() => setShowDriverPicker(false)}
                type="button"
              >
                Cancelar
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {showReschedule ? (
        <div className="confirm-dialog__backdrop" role="presentation">
          <section
            aria-labelledby="reschedule-title"
            aria-modal="true"
            className="confirm-dialog"
            role="dialog"
          >
            <button
              aria-label="Cerrar reprogramación"
              className="icon-button confirm-dialog__close"
              onClick={() => setShowReschedule(false)}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
            <span className="confirm-dialog__icon">
              <Clock3 aria-hidden="true" size={22} />
            </span>
            <h2 id="reschedule-title">Reprogramar entrega</h2>
            <p>Indica la nueva hora estimada de entrega.</p>
            <label className="delivery-field">
              <span>Nueva hora (HH:MM)</span>
              <input
                type="time"
                value={rescheduleTime}
                onChange={(e) => setRescheduleTime(e.target.value)}
              />
            </label>
            <div className="confirm-dialog__actions">
              <button
                className="button button--secondary"
                onClick={() => setShowReschedule(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="button button--primary"
                disabled={!rescheduleTime}
                onClick={rescheduleOrder}
                type="button"
              >
                Confirmar reprogramación
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}