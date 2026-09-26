"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";
import styles from "./service-capability-panel.module.css";

type CapabilityStatus =
  | "ENABLED"
  | "MANUAL_APPROVAL"
  | "PAUSED"
  | "DISABLED";
type Capability = {
  code: string;
  status: CapabilityStatus;
  reason: string;
  rowVersion: number;
  effectiveFrom: string;
  effectiveUntil: string | null;
};

const labels: Record<string, string> = {
  LOCAL: "Servicio local",
  RESERVATIONS: "Reservaciones",
  DINE_IN_ONLINE: "Consumo en mesa solicitado en línea",
  PICKUP: "Pedidos para recoger",
  DELIVERY: "Delivery",
  ONLINE_ORDERS: "Pedidos en línea",
  MESSAGING: "Mensajería",
  ONLINE_PAYMENTS: "Pagos en línea",
  PRODUCTION: "Producción interna",
};
const statuses: { value: CapabilityStatus; label: string }[] = [
  { value: "ENABLED", label: "Habilitado" },
  { value: "MANUAL_APPROVAL", label: "Requiere aprobación manual" },
  { value: "PAUSED", label: "Pausado" },
  { value: "DISABLED", label: "Deshabilitado" },
];
const statusLabels = Object.fromEntries(
  statuses.map(({ value, label }) => [value, label]),
) as Record<CapabilityStatus, string>;

function responseMessage(body: unknown, fallback: string) {
  if (
    body &&
    typeof body === "object" &&
    "message" in body &&
    typeof body.message === "string"
  )
    return body.message;
  return fallback;
}

async function requestCapabilities(): Promise<Capability[]> {
  const response = await fetch("/api/admin/service-capabilities", {
    cache: "no-store",
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      responseMessage(
        body,
        response.status === 503
          ? "Configura WOK_API_BASE_URL en el servidor web para conectar la API."
          : "No se pudieron cargar las capacidades del servicio.",
      ),
    );
  if (!Array.isArray(body)) throw new Error("Respuesta de capacidades inválida.");
  return body.filter(
    (item): item is Capability =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof item.code === "string" &&
      typeof item.status === "string" &&
      statuses.some((status) => status.value === item.status) &&
      typeof item.reason === "string" &&
      Number.isInteger(item.rowVersion),
  );
}

export function ServiceCapabilityPanel() {
  const [items, setItems] = useState<Capability[]>([]);
  const [drafts, setDrafts] = useState<Record<string, CapabilityStatus>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [source, setSource] = useState<"api" | "unavailable" | "unauthorized" | null>(null);

  const acceptCapabilities = useCallback((capabilities: Capability[]) => {
    setItems(capabilities);
    setDrafts(Object.fromEntries(capabilities.map((item) => [item.code, item.status])));
    setReasons({});
    setSource("api");
    setError("");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      acceptCapabilities(await requestCapabilities());
    } catch (cause) {
      setItems([]);
      setSource("unavailable");
      setError(
        cause instanceof Error ? cause.message : "No se pudo conectar con la API WOK.",
      );
    } finally {
      setLoading(false);
    }
  }, [acceptCapabilities]);

  useEffect(() => {
    let active = true;
    requestCapabilities()
      .then((capabilities) => {
        if (active) acceptCapabilities(capabilities);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setItems([]);
        setSource("unavailable");
        setError(
          cause instanceof Error ? cause.message : "No se pudo conectar con la API WOK.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [acceptCapabilities]);

  async function save(item: Capability) {
    const status = drafts[item.code] ?? item.status;
    const reason = reasons[item.code]?.trim() ?? "";
    if (saving || status === item.status || reason.length < 3) return;
    setSaving(item.code);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/admin/service-capabilities/${encodeURIComponent(item.code)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, reason, expectedVersion: item.rowVersion }),
        },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(
          responseMessage(body, "No se pudo guardar el cambio. Actualiza y reintenta."),
        );
        if (response.status === 409) setNotice("La versión local quedó desactualizada; vuelve a cargar la lista.");
        return;
      }
      const updated = body as Capability;
      setItems((current) => current.map((entry) => entry.code === item.code ? updated : entry));
      setDrafts((current) => ({ ...current, [item.code]: updated.status }));
      setReasons((current) => ({ ...current, [item.code]: "" }));
      setNotice(`${labels[item.code] ?? item.code}: cambio guardado y auditado por el servidor.`);
    } catch {
      setError("No se pudo conectar con la API WOK. El estado anterior se conserva.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="service-capabilities-title">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}><ShieldCheck aria-hidden="true" size={15} /> Control persistido</span>
          <h2 id="service-capabilities-title">Disponibilidad por servicio</h2>
          <p>El backend valida permisos, motivo y versión; cada cambio queda auditado.</p>
        </div>
        <button className={styles.refresh} type="button" onClick={() => { setLoading(true); void load(); }} disabled={loading || saving !== null}>
          <RefreshCw aria-hidden="true" size={16} /> Actualizar
        </button>
      </header>

      {source === "api" && <p className={styles.source}>Fuente: API WOK</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {loading ? (
        <p role="status" aria-busy="true">Cargando capacidades del servicio…</p>
      ) : items.length ? (
        <div className={styles.grid}>
          {items.map((item) => {
            const draft = drafts[item.code] ?? item.status;
            const changed = draft !== item.status;
            return (
              <article className={styles.card} key={item.code}>
                <div className={styles.cardHeader}>
                  <div>
                    <h3>{labels[item.code] ?? item.code}</h3>
                    <code>{item.code}</code>
                  </div>
                  <span className={`${styles.badge} ${styles[`status_${item.status}`]}`}>
                    {statusLabels[item.status]}
                  </span>
                </div>
                <p className={styles.reason}>Motivo vigente: {item.reason}</p>
                <p className={styles.version}>Versión {item.rowVersion}</p>
                <label className={styles.field} htmlFor={`service-status-${item.code}`}>
                  Estado nuevo · {labels[item.code] ?? item.code}
                  <select
                    id={`service-status-${item.code}`}
                    value={draft}
                    disabled={saving !== null}
                    onChange={(event) => setDrafts((current) => ({ ...current, [item.code]: event.target.value as CapabilityStatus }))}
                  >
                    {statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                  </select>
                </label>
                <label className={styles.field} htmlFor={`service-reason-${item.code}`}>
                  Motivo del cambio · {labels[item.code] ?? item.code}
                  <textarea
                    id={`service-reason-${item.code}`}
                    rows={2}
                    maxLength={500}
                    value={reasons[item.code] ?? ""}
                    disabled={saving !== null}
                    onChange={(event) => setReasons((current) => ({ ...current, [item.code]: event.target.value }))}
                    placeholder="Describe por qué se cambia"
                  />
                </label>
                <button
                  className={styles.save}
                  type="button"
                  disabled={!changed || (reasons[item.code]?.trim().length ?? 0) < 3 || saving !== null}
                  onClick={() => void save(item)}
                >
                  {saving === item.code ? "Guardando…" : `Guardar cambio · ${labels[item.code] ?? item.code}`}
                </button>
              </article>
            );
          })}
        </div>
      ) : !error ? (
        <p role="status">La API no devolvió capacidades configuradas.</p>
      ) : null}
    </section>
  );
}
