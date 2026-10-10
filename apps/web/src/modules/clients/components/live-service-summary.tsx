"use client";
import { useEffect, useState } from "react";
import {
  capabilityLabels,
  capabilityStatuses,
  isCapabilities,
  type Capability,
} from "../service-contract";
import styles from "./client-home.module.css";
export function LiveServiceSummary() {
  const [result, setResult] = useState<{
    data: Capability[] | null;
    error: { message: string } | null;
  }>({ data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const { data, error } = result;
  const reload = () => {
    setResult({ data: null, error: null });
    setAttempt((value) => value + 1);
  };
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/bff/service-capabilities", {
          cache: "no-store",
          signal: controller.signal,
        });
        const body: unknown = await response.json();
        if (!response.ok) {
          const message =
            body &&
            typeof body === "object" &&
            "message" in body &&
            typeof body.message === "string"
              ? body.message
              : "Servicio no disponible";
          throw new Error(message);
        }
        if (!isCapabilities(body)) throw new Error("Servicio no disponible");
        if (!controller.signal.aborted) setResult({ data: body, error: null });
      } catch (failure) {
        if (!controller.signal.aborted)
          setResult({
            data: null,
            error: {
              message:
                failure instanceof Error
                  ? failure.message
                  : "Servicio no disponible",
            },
          });
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);
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
