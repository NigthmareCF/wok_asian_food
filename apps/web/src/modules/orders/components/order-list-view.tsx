"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bike,
  CheckCircle2,
  ChefHat,
  Clock3,
  Plus,
  Search,
  ShoppingBag,
  Utensils,
} from "lucide-react";
import {
  getOrderTotal,
  type OrderChannel,
  type OrderStatus,
} from "@/data/fixtures/orders";
import { useOrderSession } from "../order-session-provider";

type StatusFilter = "active" | OrderStatus;

const statusMeta: Record<
  OrderStatus,
  { label: string; tone: string; icon: typeof Clock3 }
> = {
  new: { label: "Nuevo", tone: "info", icon: Plus },
  sent: { label: "Comandado", tone: "neutral", icon: CheckCircle2 },
  preparing: { label: "En preparación", tone: "warning", icon: ChefHat },
  ready: { label: "Listo", tone: "success", icon: CheckCircle2 },
  delayed: { label: "Retrasado", tone: "danger", icon: AlertTriangle },
  cancelled: { label: "Anulado", tone: "muted", icon: Clock3 },
};

const channelMeta: Record<
  OrderChannel,
  { label: string; icon: typeof Utensils }
> = {
  table: { label: "Mesa", icon: Utensils },
  delivery: { label: "Delivery", icon: Bike },
  pickup: { label: "Para recoger", icon: ShoppingBag },
};

const filters: { value: StatusFilter; label: string }[] = [
  { value: "active", label: "Activos" },
  { value: "new", label: "Nuevos" },
  { value: "sent", label: "Comandados" },
  { value: "preparing", label: "Preparando" },
  { value: "ready", label: "Listos" },
  { value: "delayed", label: "Retrasados" },
];

export function OrderListView() {
  const { orders } = useOrderSession();
  const [filter, setFilter] = useState<StatusFilter>("active");
  const [query, setQuery] = useState("");

  const visibleOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es");
    return orders.filter((order) => {
      const matchesStatus =
        filter === "active"
          ? order.status !== "cancelled"
          : order.status === filter;
      const matchesQuery =
        !normalizedQuery ||
        order.id.toLocaleLowerCase("es").includes(normalizedQuery) ||
        order.source.toLocaleLowerCase("es").includes(normalizedQuery) ||
        order.items.some((item) =>
          item.name.toLocaleLowerCase("es").includes(normalizedQuery),
        );
      return matchesStatus && matchesQuery;
    });
  }, [filter, orders, query]);

  const getCount = (value: StatusFilter) =>
    orders.filter((order) =>
      value === "active"
        ? order.status !== "cancelled"
        : order.status === value,
    ).length;

  return (
    <div className="orders-page">
      <header className="ops-page-header orders-page__header">
        <div>
          <span className="ops-kicker">Módulo operativo</span>
          <h1>Pedidos</h1>
          <p>Consulta las comandas activas y atiende primero lo urgente.</p>
        </div>
        <Link className="button button--primary" href="/operation/orders/new">
          <Plus aria-hidden="true" size={18} /> Nuevo pedido
        </Link>
      </header>

      <section className="orders-summary" aria-label="Resumen de pedidos">
        <div>
          <span>Activos</span>
          <strong>{getCount("active")}</strong>
        </div>
        <div>
          <span>En cocina</span>
          <strong>{getCount("preparing") + getCount("sent")}</strong>
        </div>
        <div className="orders-summary__danger">
          <span>Requieren atención</span>
          <strong>{getCount("delayed")}</strong>
        </div>
      </section>

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
                {item.label} <span>{getCount(item.value)}</span>
              </button>
            ))}
          </div>
          <label className="orders-search">
            <Search aria-hidden="true" size={18} />
            <span className="sr-only">Buscar pedidos</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Pedido, mesa o producto"
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
            <p>{visibleOrders.length} resultados con datos simulados</p>
          </div>
        </div>

        <div className="orders-list">
          {visibleOrders.map((order) => {
            const status = statusMeta[order.status];
            const StatusIcon = status.icon;
            const channel = channelMeta[order.channel];
            const ChannelIcon = channel.icon;
            const itemCount = order.items.reduce(
              (total, item) => total + item.quantity,
              0,
            );
            return (
              <Link
                aria-label={`Abrir pedido ${order.id}, ${status.label}`}
                className={`order-row order-row--${status.tone}`}
                href={`/operation/orders/${order.id}`}
                key={order.id}
              >
                <div className="order-row__identity">
                  <span className="order-channel-icon">
                    <ChannelIcon aria-hidden="true" size={18} />
                  </span>
                  <div>
                    <strong>#{order.id}</strong>
                    <span>{order.source}</span>
                  </div>
                </div>
                <div className="order-row__items">
                  <strong>
                    {order.items.map((item) => item.name).join(" · ")}
                  </strong>
                  <span>
                    {itemCount} productos · Q{" "}
                    {getOrderTotal(order.items).toFixed(2)}
                  </span>
                </div>
                <div className="order-row__timing">
                  <strong>{order.eta}</strong>
                  <span>{order.elapsed}</span>
                </div>
                <span className={`order-status order-status--${status.tone}`}>
                  <StatusIcon aria-hidden="true" size={16} /> {status.label}
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="order-row__arrow"
                  size={18}
                />
              </Link>
            );
          })}
        </div>

        {visibleOrders.length === 0 ? (
          <div className="ops-empty-state">
            <strong>No encontramos pedidos</strong>
            <span>Prueba otro estado o cambia la búsqueda.</span>
          </div>
        ) : null}
      </section>

      <p className="mock-disclaimer">
        Los pedidos y sus tiempos son simulados; se reinician al recargar.
      </p>
    </div>
  );
}
