"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bike,
  CheckCircle2,
  CircleDot,
  Clock3,
  MapPin,
  Package,
  Play,
  Search,
  Truck,
  User,
  X,
} from "lucide-react";
import {
  deliveryOrders,
  deliveryStatusMeta,
  deliverySummary,
  formatGTQ,
  type DeliveryOrderStatus,
} from "@/data/fixtures/delivery";
import { useDeliverySession } from "../delivery-session-provider";

type StatusFilter = "active" | DeliveryOrderStatus;

const statusFilterOptions: { value: StatusFilter; label: string }[] = [
  { value: "active", label: "Activos" },
  { value: "waiting", label: "Esperando" },
  { value: "driver-assigned", label: "Asignados" },
  { value: "picked-up", label: "En camino" },
  { value: "delivered", label: "Entregados" },
  { value: "rescheduled", label: "Reprogramados" },
  { value: "cancelled", label: "Cancelados" },
];

const channelMeta = {
  table: { label: "Mesa", icon: User },
  delivery: { label: "Delivery", icon: Package },
  pickup: { label: "Recoger", icon: Bike },
} as const;

export function DeliveryListView() {
  const router = useRouter();
  const { orders, createDeliveryOrder } = useDeliverySession();
  const [filter, setFilter] = useState<StatusFilter>("active");
  const [query, setQuery] = useState("");

  const startFullFlowDemo = () => {
    const orderId = createDeliveryOrder({
      customer: "Diego Figueroa",
      address: "Zona 14, Torre Vista, Apto 5B",
      phone: "555-2010",
      notes: "Flujo desde cero: asigna repartidor, marca recogido y entregado.",
      paymentMethod: "cash",
      isDemo: true,
      items: [
        { id: "demo-1", name: "Wok teriyaki", quantity: 1, unitPrice: 112, modifiers: ["Pollo", "Medio"] },
        { id: "demo-2", name: "Gyozas de cerdo", quantity: 2, unitPrice: 68 },
      ],
    });
    router.push(`/operation/delivery/${orderId}`);
  };

  const visibleOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es");
    return orders.filter((order) => {
      const matchesStatus =
        filter === "active"
          ? order.status !== "cancelled" && order.status !== "delivered"
          : order.status === filter;
      const matchesQuery =
        !normalizedQuery ||
        order.id.toLocaleLowerCase("es").includes(normalizedQuery) ||
        order.customer.toLocaleLowerCase("es").includes(normalizedQuery) ||
        order.address.toLocaleLowerCase("es").includes(normalizedQuery) ||
        order.items.some((item) =>
          item.name.toLocaleLowerCase("es").includes(normalizedQuery),
        );
      return matchesStatus && matchesQuery;
    });
  }, [filter, orders, query]);

  const getCount = (value: StatusFilter) =>
    orders.filter((order) =>
      value === "active"
        ? order.status !== "cancelled" && order.status !== "delivered"
        : order.status === value,
    ).length;

  return (
    <div className="delivery-page">
      <header className="ops-page-header delivery-page__header">
        <div>
          <span className="ops-kicker">Módulo operativo</span>
          <h1>Delivery</h1>
          <p>Coordina pedidos de entrega desde preparación hasta recogida.</p>
        </div>
        <div className="ops-header-actions">
          <span className="delivery-summary-counter">
            <Package aria-hidden="true" size={18} /> {deliverySummary.total} pedidos ·{" "}
            {deliverySummary.pendingPayment} pendientes de pago
          </span>
          <button
            className="button button--secondary button--compact"
            onClick={startFullFlowDemo}
            type="button"
          >
            <Play aria-hidden="true" size={15} /> Probar flujo desde cero
          </button>
        </div>
      </header>

      <section className="delivery-summary" aria-label="Resumen de delivery">
        <div>
          <span>Activos</span>
          <strong>{getCount("active")}</strong>
        </div>
        <div>
          <span>En tránsito</span>
          <strong>{getCount("picked-up") + getCount("driver-assigned")}</strong>
        </div>
        <div className="delivery-summary__attention">
          <span>Esperando repartidor</span>
          <strong>{getCount("waiting")}</strong>
        </div>
        <div>
          <span>Pendientes de pago</span>
          <strong>{deliverySummary.pendingPayment}</strong>
        </div>
      </section>

      <section
        className="delivery-workspace"
        aria-labelledby="active-deliveries-title"
      >
        <div className="delivery-toolbar">
          <div className="delivery-filter" aria-label="Filtrar pedidos">
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
          <label className="delivery-search">
            <Search aria-hidden="true" size={18} />
            <span className="sr-only">Buscar pedidos</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Pedido, cliente, dirección o producto"
              type="search"
              value={query}
            />
          </label>
        </div>

        <div className="ops-section-heading delivery-list-heading">
          <div>
            <h2 id="active-deliveries-title">
              {statusFilterOptions.find((item) => item.value === filter)?.label}
            </h2>
            <p>{visibleOrders.length} resultados con datos simulados</p>
          </div>
        </div>

        <div className="delivery-list">
          {visibleOrders.map((order) => {
            const status = deliveryStatusMeta[order.status];
            const StatusIcon = {
              waiting: Clock3,
              "driver-assigned": Bike,
              "picked-up": Truck,
              delivered: CheckCircle2,
              rescheduled: CircleDot,
              cancelled: X,
            }[order.status];
            const paymentStatus = order.paymentStatus === "pending" ? "pending" : "collected";

            return (
              <Link
                aria-label={`Abrir delivery ${order.id}, ${status.label}`}
                className={`delivery-row delivery-row--${status.tone}`}
                href={`/operation/delivery/${order.id}`}
                key={order.id}
              >
                <div className="delivery-row__identity">
                  <span className="delivery-channel-icon">
                    <Package aria-hidden="true" size={18} />
                  </span>
                  <div>
                    <strong>#{order.id}</strong>
                    <span>{order.customer}</span>
                  </div>
                </div>
                <div className="delivery-row__address">
                  <MapPin aria-hidden="true" size={14} />
                  <span>{order.address}</span>
                </div>
                <div className="delivery-row__items">
                  <strong>
                    {order.items.map((item) => item.name).join(" · ")}
                  </strong>
                  <span>
                    {order.items.reduce((sum, item) => sum + item.quantity, 0)} productos ·
                    {formatGTQ(order.total)}
                  </span>
                </div>
                <div className="delivery-row__timing">
                  <strong>{order.eta}</strong>
                  <span>{order.elapsed}</span>
                </div>
                <div className="delivery-row__driver">
                  {order.driver ? (
                    <>
                      <Bike aria-hidden="true" size={14} />
                      <span>{order.driver}</span>
                    </>
                  ) : (
                    <span className="delivery-row__no-driver">
                      <AlertTriangle aria-hidden="true" size={14} /> Sin asignar
                    </span>
                  )}
                </div>
                <span
                  className={`delivery-status delivery-status--${status.tone}`}
                >
                  <StatusIcon aria-hidden="true" size={14} /> {status.label}
                </span>
                <span
                  className={`payment-status payment-status--${paymentStatus}`}
                >
                  {paymentStatus === "pending" ? "Pago pendiente" : "Pagado"}
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="delivery-row__arrow"
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
        Los pedidos y repartidores son simulados; se reinician al recargar.
      </p>
    </div>
  );
}