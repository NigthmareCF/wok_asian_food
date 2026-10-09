"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { usePickupResource } from "@/modules/client-order-tracking/use-pickup-resource";
import { isOperationalTables } from "@/modules/tables/live-contract";
import { isOrderSummaries, isStationLoads } from "../dashboard-contract";

const tableLabels = {
  FREE: "Libres",
  OCCUPIED: "Ocupadas",
  RESERVED: "Reservadas",
  CLEANING: "En limpieza",
  UNAVAILABLE: "No disponibles",
} as const;
const orderLabels: Record<string, string> = {
  SENT: "Enviado a cocina",
  PREPARING: "Preparando",
  READY: "Listo",
  SERVED: "Servido",
  CLOSED: "Cerrado",
  CANCELLED: "Cancelado",
};
function ResourcePanel({
  title,
  data,
  error,
  reload,
  children,
}: {
  title: string;
  data: unknown;
  error: { message: string; status: number } | null;
  reload: () => void;
  children: ReactNode;
}) {
  return (
    <section className="ops-work-panel">
      <h2>{title}</h2>
      {error ? (
        <p role="alert">{error.message}</p>
      ) : data === null ? (
        <p role="status">Cargando {title.toLowerCase()}…</p>
      ) : (
        children
      )}
      <button
        type="button"
        className="button button--secondary"
        onClick={reload}
      >
        Actualizar {title.toLowerCase()}
      </button>
    </section>
  );
}
export function OperationalDashboard() {
  const tables = usePickupResource(
    "/bff/operational/tables?active=true",
    isOperationalTables,
  );
  const orders = usePickupResource("/bff/operational/orders", isOrderSummaries);
  const kitchen = usePickupResource(
    "/bff/operational/kitchen/load",
    isStationLoads,
  );
  return (
    <div className="ops-dashboard">
      <header className="ops-page-header">
        <div>
          <h1>Centro de operaciones</h1>
          <p>
            Datos persistidos. Actualización manual; sin conexión en tiempo
            real.
          </p>
        </div>
      </header>
      <div className="ops-focus-grid">
        <ResourcePanel title="Mesas" {...tables}>
          {tables.data?.length === 0 ? (
            <p>No hay mesas activas.</p>
          ) : (
            <ul>
              {Object.entries(tableLabels).map(([status, label]) => (
                <li key={status}>
                  {label}:{" "}
                  {
                    tables.data?.filter((table) => table.status === status)
                      .length
                  }
                </li>
              ))}
            </ul>
          )}
          <Link className="text-action" href="/operation/tables">
            Ver mesas
          </Link>
        </ResourcePanel>
        <ResourcePanel title="Cocina" {...kitchen}>
          {kitchen.data?.length === 0 ? (
            <p>No hay estaciones activas.</p>
          ) : (
            kitchen.data?.map((station) => (
              <article key={station.stationId}>
                <h3>{station.stationCode}</h3>
                <p>
                  En cola: {station.queued} · Preparando: {station.preparing} ·
                  Listos: {station.ready}
                </p>
              </article>
            ))
          )}
          <p>Porcentaje de carga y ETA global bloqueados: faltan contratos.</p>
          <Link className="text-action" href="/operation/kitchen">
            Ver cocina
          </Link>
        </ResourcePanel>
      </div>
      <ResourcePanel title="Pedidos recientes" {...orders}>
        <p>
          La consulta devuelve como máximo 200 pedidos recientes. No representa
          un total de ventas ni de pedidos activos.
        </p>
        {orders.data?.length === 0 ? (
          <p>No hay pedidos registrados.</p>
        ) : (
          <ul>
            {orders.data?.map((order) => (
              <li key={order.id}>
                <strong>{order.code}</strong> · {orderLabels[order.status]} ·{" "}
                {order.diningTableName ?? order.accountName} · Artículos:{" "}
                {order.itemCount}
              </li>
            ))}
          </ul>
        )}
        <Link className="text-action" href="/operation/orders">
          Abrir pedidos
        </Link>
      </ResourcePanel>
      <section className="ops-work-panel">
        <h2>Indicadores pendientes</h2>
        <p>
          Bloqueados: alertas agregadas, pedidos que requieren atención y ETA
          global. No hay contratos suficientes para estos indicadores.
        </p>
      </section>
    </div>
  );
}
