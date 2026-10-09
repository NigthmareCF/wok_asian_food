"use client";
import { usePickupResource } from "@/modules/client-order-tracking/use-pickup-resource";
import {
  capabilityLabels,
  capabilityStatuses,
  isCapabilities,
} from "../service-contract";
import styles from "./client-home.module.css";
export function LiveServiceSummary() {
  const { data, error, reload } = usePickupResource(
    "/bff/service-capabilities",
    isCapabilities,
  );
  return (
    <aside className={styles.service} aria-label="Estado de servicios">
      <h2>Servicios</h2>
      {error ? (
        <p role="alert">{error.message}</p>
      ) : data === null ? (
        <p role="status">Cargando servicios…</p>
      ) : data.length === 0 ? (
        <p>No hay servicios publicados.</p>
      ) : (
        <ul>
          {data.map((row) => (
            <li key={row.code}>
              {capabilityLabels[row.code]}: {capabilityStatuses[row.status]}
            </li>
          ))}
        </ul>
      )}
      <button
        className="button button--secondary"
        onClick={reload}
        type="button"
      >
        Actualizar servicios
      </button>
      <p>Horarios y estimación de preparación pendientes de integración.</p>
    </aside>
  );
}
