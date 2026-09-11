import {
  Check,
  Circle,
  Clock3,
  PackageCheck,
  TriangleAlert,
  Truck,
} from "lucide-react";
import type { ClientOrderTrackingSnapshot } from "../order-tracking";
import { orderStatusLabels } from "../order-tracking";
import styles from "./order-tracking.module.css";

const restaurantStages = [
  ["confirmed", "Confirmado"],
  ["preparing", "En preparación"],
  ["ready", "Listo"],
] as const;

export function OrderTrackingView({
  order,
}: {
  order?: ClientOrderTrackingSnapshot;
}) {
  if (!order)
    return (
      <section className={styles.empty} aria-labelledby="not-found-title">
        <PackageCheck aria-hidden="true" size={32} />
        <h1 id="not-found-title">Pedido no encontrado</h1>
        <p>Este seguimiento no está disponible en la demostración.</p>
      </section>
    );

  const isDelivery = order.fulfillment === "delivery";
  return (
    <section className={styles.tracking} aria-labelledby="tracking-title">
      <header className={styles.header}>
        <span className={styles.kicker}>
          PEDIDO #{order.id.replace("demo-", "")}
        </span>
        <h1 id="tracking-title">Seguimiento de pedido</h1>
        <span className={styles.currentStatus}>
          {orderStatusLabels[order.status]}
        </span>
      </header>

      <section className={styles.card} aria-labelledby="status-title">
        <h2 id="status-title">ESTADO DEL PEDIDO</h2>
        <div className={styles.timeline}>
          {restaurantStages.map(([stage, label]) => (
            <TimelineItem
              complete={
                restaurantStageRank(order.restaurantStage) >
                restaurantStageRank(stage)
              }
              current={
                order.restaurantStage === stage && order.status !== "delivered"
              }
              key={stage}
              label={label}
            />
          ))}
          {isDelivery ? (
            <TimelineItem
              complete={order.deliveryStage === "delivered"}
              current={order.deliveryStage === "in-transit"}
              label={
                order.deliveryStage === "delivered"
                  ? "Entregado"
                  : "Traslado externo"
              }
            />
          ) : null}
        </div>
      </section>

      {order.estimatedTime ? (
        <section className={styles.eta} aria-label="Tiempo estimado">
          <div>
            <span>TIEMPO ESTIMADO</span>
            <strong>{order.estimatedTime}</strong>
            <small>
              {isDelivery
                ? "Preparación y traslado externo"
                : "Preparación del restaurante"}
            </small>
          </div>
          <Clock3 aria-hidden="true" size={30} />
        </section>
      ) : null}
      {order.delayMessage ? (
        <section className={styles.delay} role="status">
          <TriangleAlert aria-hidden="true" size={21} />
          <div>
            <strong>{order.delayMessage}</strong>
            <span>Nuevo tiempo estimado: {order.estimatedTime}.</span>
          </div>
        </section>
      ) : null}
      {order.changes.length > 0 ? (
        <section className={styles.card} aria-labelledby="changes-title">
          <h2 id="changes-title">CAMBIOS EN TU PEDIDO</h2>
          <div className={styles.changes}>
            {order.changes.map((change) => (
              <p
                className={
                  change.kind === "added" ? styles.added : styles.updated
                }
                key={change.description}
              >
                {change.description}
              </p>
            ))}
          </div>
        </section>
      ) : null}
      {isDelivery ? (
        <section className={styles.card} aria-labelledby="delivery-title">
          <h2 id="delivery-title">ENTREGA O TRASLADO EXTERNO</h2>
          <div className={styles.delivery}>
            <Truck aria-hidden="true" size={24} />
            <div>
              <strong>{deliveryLabel(order.deliveryStage)}</strong>
              <span>
                El traslado se muestra por separado de la preparación del
                restaurante.
              </span>
            </div>
          </div>
        </section>
      ) : (
        <section className={styles.card} aria-labelledby="restaurant-title">
          <h2 id="restaurant-title">PREPARACIÓN DEL RESTAURANTE</h2>
          <p className={styles.stageNote}>
            {restaurantLabel(order.restaurantStage)}
          </p>
        </section>
      )}
    </section>
  );
}

function TimelineItem({
  label,
  complete,
  current,
}: {
  label: string;
  complete: boolean;
  current: boolean;
}) {
  return (
    <div
      className={`${styles.timelineItem} ${complete ? styles.complete : ""} ${current ? styles.current : ""}`}
    >
      <span>
        {complete ? (
          <Check aria-hidden="true" size={14} />
        ) : (
          <Circle aria-hidden="true" size={11} />
        )}
      </span>
      <div>
        <strong>{label}</strong>
        <small>
          {complete ? "Completado" : current ? "Estado actual" : "Pendiente"}
        </small>
      </div>
    </div>
  );
}

function restaurantStageRank(
  stage: ClientOrderTrackingSnapshot["restaurantStage"],
) {
  return ["pending", "confirmed", "preparing", "ready"].indexOf(stage);
}
function restaurantLabel(
  stage: ClientOrderTrackingSnapshot["restaurantStage"],
) {
  return {
    pending: "Esperando confirmación del restaurante.",
    confirmed: "El restaurante aceptó la solicitud.",
    preparing: "El restaurante está preparando tu pedido.",
    ready: "El restaurante terminó la preparación.",
  }[stage];
}
function deliveryLabel(stage: ClientOrderTrackingSnapshot["deliveryStage"]) {
  return stage === "delivered"
    ? "Entrega completada"
    : stage === "in-transit"
      ? "Traslado externo en curso"
      : "Traslado externo pendiente";
}
