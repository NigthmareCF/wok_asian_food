"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Bike,
  CheckCircle2,
  ChefHat,
  CircleAlert,
  Clock3,
  RefreshCw,
  Search,
  ShoppingBag,
  Utensils,
} from "lucide-react";
import { usePickupResource } from "@/modules/client-order-tracking/use-pickup-resource";
import {
  isOperationalOrderSummaries,
  type OperationalOrderStatus,
  type OperationalOrderSummary,
} from "../live-contract";

type StatusFilter = "ACTIVE" | OperationalOrderStatus;

const statusMeta: Record<
  OperationalOrderStatus,
  { label: string; tone: string; icon: typeof Clock3 }
> = {
  SENT: { label: "Enviado", tone: "neutral", icon: CheckCircle2 },
  PREPARING: { label: "En preparación", tone: "warning", icon: ChefHat },
  READY: { label: "Listo", tone: "success", icon: CheckCircle2 },
  SERVED: { label: "Servido", tone: "info", icon: Utensils },
  CLOSED: { label: "Cerrado", tone: "muted", icon: CheckCircle2 },
  CANCELLED: { label: "Anulado", tone: "danger", icon: CircleAlert },
};

const filters: { value: StatusFilter; label: string }[] = [
  { value: "ACTIVE", label: "Activos" },
  { value: "SENT", label: "Enviados" },
  { value: "PREPARING", label: "Preparando" },
  { value: "READY", label: "Listos" },
  { value: "SERVED", label: "Servidos" },
  { value: "CLOSED", label: "Cerrados" },
  { value: "CANCELLED", label: "Anulados" },
];

function source(order: OperationalOrderSummary) {
  if (order.diningTableName) return order.diningTableName;
  if (order.channel === "PICKUP") return "Para recoger";
  if (order.channel === "DELIVERY") return "Delivery";
  return order.accountName;
}

function ChannelIcon({
  channel,
}: {
  channel: OperationalOrderSummary["channel"];
}) {
  const Icon =
    channel === "DINE_IN"
      ? Utensils
      : channel === "PICKUP"
        ? ShoppingBag
        : Bike;
  return <Icon aria-hidden="true" size={18} />;
}

export function OperationalOrderListView() {
  const resource = usePickupResource(
    "/bff/operational/orders",
    isOperationalOrderSummaries,
  );
  const [filter, setFilter] = useState<StatusFilter>("ACTIVE");
  const [query, setQuery] = useState("");
  const orders = useMemo(() => resource.data ?? [], [resource.data]);

  const matchesFilter = (
    order: OperationalOrderSummary,
    value: StatusFilter,
  ) =>
    value === "ACTIVE"
      ? !["CLOSED", "CANCELLED"].includes(order.status)
      : order.status === value;
  const count = (value: StatusFilter) =>
    orders.filter((order) => matchesFilter(order, value)).length;
  const visibleOrders = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    return orders.filter(
      (order) =>
        matchesFilter(order, filter) &&
        (!normalized ||
          order.code.toLocaleLowerCase("es").includes(normalized) ||
          source(order).toLocaleLowerCase("es").includes(normalized) ||
          order.accountName.toLocaleLowerCase("es").includes(normalized)),
    );
  }, [filter, orders, query]);

  return (
    <div className="orders-page">
      <header className="ops-page-header orders-page__header">
        <div>
          <span className="ops-kicker">Módulo operativo</span>
          <h1>Pedidos</h1>
          <p>Consulta pedidos persistidos y su avance real en cocina.</p>
        </div>
        <Link className="button button--primary" href="/operation/tables">
          <Utensils aria-hidden="true" size={18} /> Abrir desde mesas
        </Link>
      </header>

      <section className="orders-summary" aria-label="Resumen de pedidos">
        <div>
          <span>Activos</span>
          <strong>{count("ACTIVE")}</strong>
        </div>
        <div>
          <span>En cocina</span>
          <strong>{count("SENT") + count("PREPARING")}</strong>
        </div>
        <div>
          <span>Listos para servir</span>
          <strong>{count("READY")}</strong>
        </div>
      </section>

      {resource.error ? (
        <div
          className="order-state-strip order-state-strip--danger"
          role="alert"
        >
          <CircleAlert aria-hidden="true" size={20} />
          <div>
            <strong>No pudimos cargar los pedidos</strong>
            <span>{resource.error.message}</span>
          </div>
          <button
            className="button button--secondary button--compact"
            onClick={resource.reload}
            type="button"
          >
            <RefreshCw aria-hidden="true" size={16} /> Reintentar
          </button>
        </div>
      ) : null}

      <section
        className="orders-workspace"
        aria-labelledby="active-orders-title"
      >
        <div className="orders-toolbar">
          <div className="orders-filter" aria-label="Filtrar pedidos">
            {filters.map((item) => (
              <button
                aria-pressed={filter === item.value}
                key={item.value}
                onClick={() => setFilter(item.value)}
                type="button"
              >
                {item.label} <span>{count(item.value)}</span>
              </button>
            ))}
          </div>
          <label className="orders-search">
            <Search aria-hidden="true" size={18} />
            <span className="sr-only">Buscar pedidos</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Código, mesa o cuenta"
              type="search"
              value={query}
            />
          </label>
        </div>

        <div className="ops-section-heading orders-list-heading">
          <div>
            <h2 id="active-orders-title">
              {filters.find((item) => item.value === filter)?.label}
            </h2>
            <p>
              {resource.data == null
                ? "Cargando pedidos..."
                : `${visibleOrders.length} resultados reales`}
            </p>
          </div>
          <button
            className="button button--secondary button--compact"
            disabled={resource.data == null}
            onClick={resource.reload}
            type="button"
          >
            <RefreshCw aria-hidden="true" size={16} /> Actualizar
          </button>
        </div>

        <div className="orders-list">
          {visibleOrders.map((order) => {
            const meta = statusMeta[order.status];
            const StatusIcon = meta.icon;
            return (
              <Link
                aria-label={`Abrir pedido ${order.code}, ${meta.label}`}
                className={`order-row order-row--${meta.tone}`}
                href={`/operation/orders/${order.id}`}
                key={order.id}
              >
                <div className="order-row__identity">
                  <span className="order-channel-icon">
                    <ChannelIcon channel={order.channel} />
                  </span>
                  <div>
                    <strong>{order.code}</strong>
                    <span>{source(order)}</span>
                  </div>
                </div>
                <div className="order-row__items">
                  <strong>{order.accountName}</strong>
                  <span>
                    {order.itemCount} líneas · {order.currency}{" "}
                    {order.total.toFixed(2)}
                  </span>
                </div>
                <div className="order-row__timing">
                  <strong>{order.guestCount} personas</strong>
                  <span>
                    {new Intl.DateTimeFormat("es-GT", {
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(order.openedAt))}
                  </span>
                </div>
                <span className={`order-status order-status--${meta.tone}`}>
                  <StatusIcon aria-hidden="true" size={15} />
                  {meta.label}
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="order-row__arrow"
                  size={18}
                />
              </Link>
            );
          })}
          {resource.data != null && visibleOrders.length === 0 ? (
            <div className="ops-empty-state">
              <strong>No hay pedidos en este filtro</strong>
              <span>Prueba otro estado o actualiza la lista.</span>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
