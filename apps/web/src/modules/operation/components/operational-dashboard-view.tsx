"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlarmClockOff,
  ArrowRight,
  ChefHat,
  CircleCheck,
  CircleDot,
  ReceiptText,
} from "lucide-react";
import {
  operationalAlerts,
  operationalKitchenSummary,
  operationalOrders,
  operationalOrderSummary,
  operationalTableSummary,
  type OperationalOrder,
} from "@/data/fixtures/operation";

const orderStatus = {
  new: { icon: CircleDot, label: "Nuevo", tone: "info" },
  preparing: { icon: ChefHat, label: "Preparando", tone: "warning" },
  ready: { icon: CircleCheck, label: "Listo", tone: "success" },
  delayed: { icon: AlarmClockOff, label: "Retrasado", tone: "danger" },
} satisfies Record<
  OperationalOrder["status"],
  { icon: typeof ChefHat; label: string; tone: string }
>;

type OrderFilter = "all" | OperationalOrder["status"];

export function OperationalDashboard() {
  const [orderFilter, setOrderFilter] = useState<OrderFilter>("all");

  const filteredOrders = useMemo(
    () =>
      orderFilter === "all"
        ? operationalOrders
        : operationalOrders.filter((order) => order.status === orderFilter),
    [orderFilter],
  );

  return (
    <div className="ops-dashboard ops-dashboard--focused">
      <header className="ops-page-header ops-page-header--focused">
        <div>
          <span className="ops-kicker">Turno actual</span>
          <h1>Centro de operaciones</h1>
          <p>Mesas, pedidos y cocina en una sola vista.</p>
        </div>
        <Link className="ops-service-link" href="/operation/status">
          <span className="live-dot" aria-hidden="true" />
          <span>
            <strong>Servicio normal</strong>
            <small>Datos simulados</small>
          </span>
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </header>

      <section className="ops-focus-grid" aria-label="Resumen operativo">
        <article className="ops-table-summary">
          <div className="ops-summary-heading">
            <div>
              <span>Salón</span>
              <h2>Estado de mesas</h2>
            </div>
            <Link className="text-action" href="/operation/tables">
              Ver mesas <ArrowRight aria-hidden="true" size={15} />
            </Link>
          </div>
          <div className="ops-table-summary__content">
            <div
              aria-label={`${operationalTableSummary.occupied} mesas ocupadas, ${operationalTableSummary.reserved} reservadas y ${operationalTableSummary.free} libres`}
              className="ops-table-donut"
              role="img"
            >
              <div>
                <strong>{operationalTableSummary.total}</strong>
                <span>mesas</span>
              </div>
            </div>
            <ul className="ops-table-legend">
              <li className="ops-table-legend__occupied">
                <span aria-hidden="true" />
                <div>
                  <strong>{operationalTableSummary.occupied}</strong>
                  <small>Ocupadas</small>
                </div>
              </li>
              <li className="ops-table-legend__reserved">
                <span aria-hidden="true" />
                <div>
                  <strong>{operationalTableSummary.reserved}</strong>
                  <small>Reservadas</small>
                </div>
              </li>
              <li className="ops-table-legend__free">
                <span aria-hidden="true" />
                <div>
                  <strong>{operationalTableSummary.free}</strong>
                  <small>Libres</small>
                </div>
              </li>
            </ul>
          </div>
        </article>

        <div className="ops-compact-summaries">
          <article className="ops-compact-summary">
            <div>
              <span>Pedidos activos</span>
              <strong>{operationalOrderSummary.active}</strong>
            </div>
            <p>{operationalOrderSummary.attention} requieren atención</p>
            <Link className="text-action" href="/operation/orders">
              Abrir pedidos <ArrowRight aria-hidden="true" size={15} />
            </Link>
          </article>

          <article className="ops-compact-summary ops-compact-summary--kitchen">
            <div>
              <span>Carga de cocina</span>
              <strong>{operationalKitchenSummary.load}%</strong>
            </div>
            <div
              aria-label={`Carga de cocina ${operationalKitchenSummary.load}%`}
              className="ops-kitchen-progress"
              role="progressbar"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={operationalKitchenSummary.load}
            >
              <span style={{ width: `${operationalKitchenSummary.load}%` }} />
            </div>
            <p>Tiempo estimado: {operationalKitchenSummary.eta}</p>
            <Link className="text-action" href="/operation/kitchen">
              Ver cocina <ArrowRight aria-hidden="true" size={15} />
            </Link>
          </article>
        </div>
      </section>

      <div className="ops-content-grid ops-content-grid--focused">
        <section
          className="ops-work-panel"
          aria-labelledby="active-orders-title"
        >
          <div className="ops-section-heading ops-section-heading--compact">
            <div>
              <h2 id="active-orders-title">Pedidos activos</h2>
              <p>{filteredOrders.length} pedidos en esta vista</p>
            </div>
            <Link className="text-action" href="/operation/orders">
              Ver todos <ArrowRight aria-hidden="true" size={15} />
            </Link>
          </div>

          <div className="segmented-control" aria-label="Filtrar pedidos">
            {(
              [
                ["all", "Todos"],
                ["new", "Nuevos"],
                ["preparing", "Preparando"],
                ["ready", "Listos"],
                ["delayed", "Retrasados"],
              ] as const
            ).map(([value, label]) => (
              <button
                aria-pressed={orderFilter === value}
                key={value}
                onClick={() => setOrderFilter(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          <div className="ops-order-list">
            {filteredOrders.length > 0 ? (
              filteredOrders.map((order) => {
                const status = orderStatus[order.status];
                const StatusIcon = status.icon;
                return (
                  <Link
                    className="ops-order-row ops-order-row--focused"
                    href={`/operation/orders/${order.id.replace(/[^A-Za-z0-9-]/g, "")}`}
                    key={order.id}
                  >
                    <div className="ops-order-row__identity">
                      <strong>{order.id}</strong>
                      <span>{order.source}</span>
                    </div>
                    <p>{order.summary}</p>
                    <div className="ops-order-row__time">
                      <span>{order.elapsed}</span>
                      <strong>{order.eta}</strong>
                    </div>
                    <span
                      aria-label={status.label}
                      className={`ops-order-state ops-order-state--${status.tone}`}
                      title={status.label}
                    >
                      <StatusIcon aria-hidden="true" size={20} />
                    </span>
                  </Link>
                );
              })
            ) : (
              <div className="ops-empty-state">
                <ReceiptText aria-hidden="true" size={26} />
                <strong>No hay pedidos con este estado</strong>
                <span>Selecciona otro filtro para continuar.</span>
              </div>
            )}
          </div>
        </section>

        <aside className="ops-work-panel" aria-labelledby="alerts-title">
          <div className="ops-section-heading ops-section-heading--compact">
            <div>
              <h2 id="alerts-title">Atención</h2>
              <p>Solo lo que requiere actuar</p>
            </div>
          </div>
          <div className="ops-alert-list">
            {operationalAlerts.map((alert) => (
              <article
                className={`ops-alert ops-alert--${alert.tone}`}
                key={alert.id}
              >
                <div>
                  <strong>{alert.title}</strong>
                  <p>{alert.detail}</p>
                </div>
                <span>{alert.time}</span>
              </article>
            ))}
          </div>
        </aside>
      </div>

      <p className="mock-disclaimer">
        Datos simulados para validar la experiencia operativa.
      </p>
    </div>
  );
}
