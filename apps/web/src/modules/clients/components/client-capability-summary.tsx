"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, XCircle } from "lucide-react";
import { StatusBadge } from "@/shared/components/ui/status-badge";
import type { ServiceCapability } from "./service-capability-types";
import styles from "./client-home.module.css";

const services: Record<string, string> = {
  RESERVATIONS: "Reservaciones",
  DINE_IN_ONLINE: "Consumo en mesa en línea",
  PICKUP: "Para recoger",
  DELIVERY: "Delivery",
  ONLINE_ORDERS: "Pedidos en línea",
  MESSAGING: "Mensajes",
};
const statusText: Record<ServiceCapability["status"], string> = {
  ENABLED: "Disponible",
  MANUAL_APPROVAL: "Aprobación manual",
  PAUSED: "Pausado temporalmente",
  DISABLED: "No disponible",
};
const tone: Record<ServiceCapability["status"], "success" | "warning" | "info" | "error"> = {
  ENABLED: "success",
  MANUAL_APPROVAL: "info",
  PAUSED: "warning",
  DISABLED: "error",
};
const icons = {
  ENABLED: CheckCircle2,
  MANUAL_APPROVAL: Clock3,
  PAUSED: AlertTriangle,
  DISABLED: XCircle,
};

type Result =
  | { state: "loading" }
  | { state: "ready"; items: ServiceCapability[] }
  | { state: "unavailable" };

export function ClientCapabilitySummary() {
  const [result, setResult] = useState<Result>({ state: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/public/service-capabilities", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Estado no disponible.");
        const body: unknown = await response.json();
        if (!Array.isArray(body)) throw new Error("Respuesta inválida.");
        const items = body.filter(
          (item): item is ServiceCapability =>
            Boolean(item) &&
            typeof item === "object" &&
            typeof item.code === "string" &&
            typeof item.status === "string" &&
            Object.hasOwn(statusText, item.status),
        );
        if (!items.length) throw new Error("Sin capacidades públicas.");
        setResult({ state: "ready", items });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ state: "unavailable" });
      });
    return () => controller.abort();
  }, []);

  return (
    <aside className={styles.service} aria-label="Disponibilidad de servicios">
      <div className={styles.serviceHeading}>
        <strong>Estado de los servicios</strong>
        <small>{result.state === "ready" ? "Información actual" : "Estado en línea"}</small>
      </div>
      {result.state === "loading" ? (
        <p role="status" aria-busy="true">Consultando disponibilidad…</p>
      ) : result.state === "unavailable" ? (
        <p role="status" className={styles.serviceUnavailable}>
          No pudimos verificar la disponibilidad actual. Intenta de nuevo antes de enviar una solicitud.
        </p>
      ) : (
        <>
          <p className={styles.serviceHint}>
            Estos estados pueden requerir confirmación del restaurante. Toda solicitud se vuelve a validar al enviarla.
          </p>
          <ul className={styles.capabilityList}>
            {result.items
              .filter((item) => item.code in services)
              .map((item) => {
                const Icon = icons[item.status];
                return (
                  <li key={item.code}>
                    <span>{services[item.code]}</span>
                    <StatusBadge label={statusText[item.status]} tone={tone[item.status]} />
                    <Icon aria-hidden="true" size={16} />
                  </li>
                );
              })}
          </ul>
        </>
      )}
    </aside>
  );
}
