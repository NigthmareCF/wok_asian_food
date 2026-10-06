"use client";
import Link from "next/link";
import { useState } from "react";
import { useLiveResource } from "@/modules/operation/use-live-resource";
import { isOrderSummaries, orderStatuses } from "../live-contract";
import { amount, orderLabels } from "../live-mapping";
import styles from "@/modules/operation/operational-flow.module.css";
export function OrderListView() {
  const [status, setStatus] = useState("");
  const resource = useLiveResource(
    "/bff/operational/orders" + (status ? "?status=" + status : ""),
    isOrderSummaries,
    true,
  );
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Pedidos</h1>
        <div className={styles.actions}>
          <Link className="button button--primary" href="/operation/orders/new">
            Nuevo pedido
          </Link>
          <Link href="/operation/kitchen">Ver cocina</Link>
          <button
            className="button button--secondary"
            onClick={resource.reload}
          >
            Actualizar
          </button>
        </div>
      </header>
      <label>
        Estado{" "}
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos</option>
          {orderStatuses.map((s) => (
            <option key={s} value={s}>
              {orderLabels[s]}
            </option>
          ))}
        </select>
      </label>
      <p>
        Se actualiza cada 15 segundos. Se muestran hasta 200 pedidos recientes.
      </p>
      {resource.error && <p role="alert">{resource.error}</p>}
      {!resource.data && !resource.error && (
        <p role="status">Cargando pedidos…</p>
      )}
      {resource.data?.length === 0 && <p>No hay pedidos para este filtro.</p>}
      <div className={styles.grid}>
        {resource.data?.map((order) => (
          <article className={styles.card} key={order.id}>
            <h2>
              <Link href={"/operation/orders/" + order.id}>{order.code}</Link>
            </h2>
            <strong>{orderLabels[order.status]}</strong>
            <p>
              {order.diningTableName ?? "Sin mesa"} · {order.accountName}
            </p>
            <p>
              {order.itemCount} líneas · {order.guestCount} personas
            </p>
            <strong>{amount(order.total, order.currency)}</strong>
          </article>
        ))}
      </div>
    </div>
  );
}
