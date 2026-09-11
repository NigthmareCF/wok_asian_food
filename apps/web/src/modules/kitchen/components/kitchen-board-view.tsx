"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChefHat,
  Check,
  CircleAlert,
  Clock3,
  Package,
  RefreshCw,
  Send,
} from "lucide-react";
import {
  orderProducts,
  type KitchenStation,
  type OrderRecord,
  type OrderStatus,
} from "@/data/fixtures/orders";
import { useOrderSession } from "@/modules/orders";
import styles from "./kitchen-board.module.css";

type KitchenStatus = Extract<
  OrderStatus,
  "sent" | "preparing" | "ready" | "delayed"
>;
type StatusFilter = "all" | KitchenStatus;
type StationFilter = "all" | KitchenStation;

const columns: {
  status: KitchenStatus;
  label: string;
  icon: typeof ChefHat;
}[] = [
  { status: "sent", label: "Nuevos", icon: Send },
  { status: "preparing", label: "Preparando", icon: ChefHat },
  { status: "ready", label: "Listos", icon: Check },
  { status: "delayed", label: "Retrasados", icon: CircleAlert },
];

const stations: { value: StationFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "Wok", label: "Wok" },
  { value: "Sushi", label: "Sushi" },
  { value: "Fría", label: "Fría" },
];

const changeLabels = {
  added: "Nuevo",
  updated: "Cambio",
  removed: "Retirar",
};

export function KitchenBoardView() {
  const { orders, updateOrderEta, updateOrderStatus } = useOrderSession();
  const [station, setStation] = useState<StationFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [reconnecting, setReconnecting] = useState(false);

  const productStations = useMemo(
    () =>
      new Map(orderProducts.map((product) => [product.id, product.station])),
    [],
  );
  const kitchenOrders = orders.filter(
    (order): order is OrderRecord & { status: KitchenStatus } =>
      ["sent", "preparing", "ready", "delayed"].includes(order.status) &&
      (station === "all" ||
        order.items.some(
          (item) => productStations.get(item.productId) === station,
        )),
  );

  const ordersForColumn = (status: KitchenStatus) =>
    kitchenOrders.filter((order) => order.status === status);

  const visibleColumns =
    statusFilter === "all"
      ? columns
      : columns.filter((column) => column.status === statusFilter);

  const visibleItems = (order: OrderRecord) =>
    station === "all"
      ? order.items
      : order.items.filter(
          (item) => productStations.get(item.productId) === station,
        );

  const toggleConnection = () => setReconnecting((current) => !current);

  return (
    <div className={styles.page}>
      <header className={`ops-page-header ${styles.header}`}>
        <div>
          <Link className="text-action" href="/operation">
            <ArrowLeft aria-hidden="true" size={16} /> Volver a operación
          </Link>
          <span className="ops-kicker">KDS · turno actual</span>
          <h1>Cocina</h1>
          <p>Acepta comandas, coordina estaciones y actualiza tiempos.</p>
        </div>
        <button
          aria-pressed={reconnecting}
          className={`button button--secondary ${styles.connection}`}
          onClick={toggleConnection}
          type="button"
        >
          <RefreshCw aria-hidden="true" size={17} />
          {reconnecting ? "Reconectando" : "Sincronización activa"}
        </button>
      </header>

      {reconnecting ? (
        <div className={styles.reconnecting} role="status">
          <RefreshCw aria-hidden="true" size={18} />
          <div>
            <strong>Reconectando con cocina</strong>
            <span>Las acciones quedan visibles y requieren revalidación.</span>
          </div>
          <button onClick={toggleConnection} type="button">
            Marcar conexión restaurada
          </button>
        </div>
      ) : null}

      <section className={styles.toolbar} aria-label="Controles de cocina">
        <div>
          <span>Estación</span>
          <div className={styles.segmented}>
            {stations.map((item) => (
              <button
                aria-pressed={station === item.value}
                key={item.value}
                onClick={() => setStation(item.value)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span>Estado</span>
          <div className={styles.segmented}>
            <button
              aria-pressed={statusFilter === "all"}
              onClick={() => setStatusFilter("all")}
              type="button"
            >
              Todos <small>{kitchenOrders.length}</small>
            </button>
            {columns.map((column) => (
              <button
                aria-pressed={statusFilter === column.status}
                key={column.status}
                onClick={() => setStatusFilter(column.status)}
                type="button"
              >
                {column.label}{" "}
                <small>{ordersForColumn(column.status).length}</small>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section
        className={`${styles.board} ${statusFilter !== "all" ? styles.boardFocused : ""}`}
        aria-label="Tablero de comandas"
      >
        {visibleColumns.map((column) => {
          const ColumnIcon = column.icon;
          const columnOrders = ordersForColumn(column.status);
          return (
            <section
              className={`${styles.column} ${styles[`column_${column.status}`]}`}
              key={column.status}
              aria-labelledby={`kitchen-${column.status}`}
            >
              <header>
                <ColumnIcon aria-hidden="true" size={18} />
                <h2 id={`kitchen-${column.status}`}>{column.label}</h2>
                <strong>{columnOrders.length}</strong>
              </header>
              <div className={styles.ticketList}>
                {columnOrders.length ? (
                  columnOrders.map((order) => {
                    const latestChange = order.kitchenChanges.at(-1);
                    return (
                      <article className={styles.ticket} key={order.id}>
                        <div className={styles.ticketHeading}>
                          <div>
                            <strong>#{order.id}</strong>
                            <span>{order.source}</span>
                          </div>
                          <span>
                            <Clock3 aria-hidden="true" size={14} />{" "}
                            {order.elapsed}
                          </span>
                        </div>
                        <ul className={styles.items}>
                          {visibleItems(order).map((item) => (
                            <li key={item.id}>
                              <strong>{item.quantity}×</strong>
                              <div>
                                <span>{item.name}</span>
                                {item.modifiers.length || item.notes ? (
                                  <small>
                                    {[...item.modifiers, item.notes]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </small>
                                ) : null}
                                {item.fulfillment === "takeaway" ? (
                                  <small>
                                    <Package aria-hidden="true" size={12} />
                                    Para llevar
                                    {item.readyAt ? ` · ${item.readyAt}` : ""}
                                  </small>
                                ) : null}
                              </div>
                            </li>
                          ))}
                        </ul>
                        {latestChange ? (
                          <div className={styles.update}>
                            <strong>
                              Actualización #{order.kitchenUpdates} ·{" "}
                              {latestChange.sentAt}
                            </strong>
                            {latestChange.items.map((item) => (
                              <span key={`${latestChange.id}-${item.itemId}`}>
                                {changeLabels[item.action]}: {item.name}
                                {item.quantity > 0 ? ` (${item.quantity})` : ""}
                                {item.fulfillment === "takeaway"
                                  ? ` · Para llevar${item.readyAt ? ` ${item.readyAt}` : ""}`
                                  : ""}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <div className={styles.eta}>
                          <label>
                            <span>ETA</span>
                            <select
                              aria-label={`ETA de pedido ${order.id}`}
                              onChange={(event) =>
                                updateOrderEta(order.id, event.target.value)
                              }
                              value={order.eta}
                            >
                              {[
                                order.eta,
                                "5 min",
                                "10 min",
                                "15 min",
                                "20 min",
                                "30 min",
                              ]
                                .filter(
                                  (value, index, values) =>
                                    values.indexOf(value) === index,
                                )
                                .map((value) => (
                                  <option key={value}>{value}</option>
                                ))}
                            </select>
                          </label>
                          {order.status === "sent" ? (
                            <button
                              className="button button--primary button--compact"
                              disabled={reconnecting}
                              onClick={() =>
                                updateOrderStatus(order.id, "preparing")
                              }
                              type="button"
                            >
                              <ChefHat aria-hidden="true" size={16} /> Aceptar
                            </button>
                          ) : order.status === "preparing" ||
                            order.status === "delayed" ? (
                            <button
                              className="button button--primary button--compact"
                              disabled={reconnecting}
                              onClick={() =>
                                updateOrderStatus(order.id, "ready")
                              }
                              type="button"
                            >
                              <Check aria-hidden="true" size={16} /> Marcar
                              listo
                            </button>
                          ) : null}
                        </div>
                        <Link
                          className={styles.openOrder}
                          href={`/operation/orders/${order.id}`}
                        >
                          Abrir pedido{" "}
                          <ArrowRight aria-hidden="true" size={15} />
                        </Link>
                      </article>
                    );
                  })
                ) : (
                  <div className={styles.empty}>
                    <ChefHat aria-hidden="true" size={21} />
                    <span>Sin comandas</span>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </section>

      <p className="mock-disclaimer">
        Estados, estaciones y sincronización simulados hasta integrar backend y
        realtime.
      </p>
    </div>
  );
}
