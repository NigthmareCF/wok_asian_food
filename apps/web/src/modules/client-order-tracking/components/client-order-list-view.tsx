"use client";

import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { useClientSession } from "@/modules/clients/client-session-provider";
import { orderStatusLabels } from "../order-tracking";
import styles from "./client-order-list.module.css";

export function ClientOrderListView() {
  const { orders } = useClientSession();
  return (
    <section className={styles.orders} aria-labelledby="client-orders-title">
      <Link className="button button--secondary" href="/client">
        Volver al inicio de Cliente
      </Link>
      <header className={styles.header}>
        <span className={styles.kicker}>MIS PEDIDOS</span>
        <h1 id="client-orders-title">Pedidos</h1>
        <p>
          Guardados solamente durante esta sesión. Recargar la página reinicia
          la lista.
        </p>
      </header>
      {orders.length ? (
        <div className={styles.list} aria-label="Pedidos de esta sesión">
          {orders.map((order) => (
            <Link
              className={styles.order}
              href={`/client/orders/${order.id}`}
              key={order.id}
            >
              <div>
                <strong>Pedido #{order.id}</strong>
                <span>{orderStatusLabels[order.status]}</span>
              </div>
              <p>{order.summary}</p>
              <p>
                {
                  {
                    table: "Mesa",
                    pickup: "Para recoger",
                    delivery: "Delivery",
                  }[order.fulfillment]
                }
              </p>
              <time dateTime={order.createdAt}>
                {new Date(order.createdAt).toLocaleString("es-GT")}
              </time>
              <small>Ver seguimiento</small>
            </Link>
          ))}
        </div>
      ) : (
        <section className={styles.empty} aria-labelledby="empty-orders-title">
          <ClipboardList aria-hidden="true" size={30} />
          <h2 id="empty-orders-title">Todavía no hay pedidos en esta sesión</h2>
          <p>
            Aquí aparecerán las solicitudes locales cuando esté disponible su
            creación.
          </p>
          <Link className="button button--primary" href="/menu">
            Ver menú
          </Link>
        </section>
      )}
    </section>
  );
}
