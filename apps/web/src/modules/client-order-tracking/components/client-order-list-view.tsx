import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { clientOrderTrackingFixtures } from "@/data/fixtures/client-order-tracking";
import type { ClientOrderTrackingSnapshot } from "../order-tracking";
import { orderStatusLabels } from "../order-tracking";
import styles from "./client-order-list.module.css";

export function ClientOrderListView({
  orders = clientOrderTrackingFixtures,
}: {
  orders?: readonly ClientOrderTrackingSnapshot[];
}) {
  return (
    <section className={styles.orders} aria-labelledby="client-orders-title">
      <header className={styles.header}>
        <span className={styles.kicker}>MIS PEDIDOS</span>
        <h1 id="client-orders-title">Pedidos</h1>
        <p>Datos demostrativos para revisar el seguimiento de Cliente.</p>
      </header>

      {orders.length ? (
        <div className={styles.list} aria-label="Pedidos demostrativos">
          {orders.map((order) => (
            <Link
              className={styles.order}
              href={`/client/orders/${order.id}`}
              key={order.id}
            >
              <div>
                <strong>Pedido #{order.id.replace("demo-", "")}</strong>
                <span>{orderStatusLabels[order.status]}</span>
              </div>
              <p>{order.summary}</p>
              <small>Ver seguimiento</small>
            </Link>
          ))}
        </div>
      ) : (
        <section className={styles.empty} aria-labelledby="empty-orders-title">
          <ClipboardList aria-hidden="true" size={30} />
          <h2 id="empty-orders-title">No hay pedidos demostrativos</h2>
          <p>Cuando existan datos de demostración, aparecerán en esta lista.</p>
        </section>
      )}
    </section>
  );
}
