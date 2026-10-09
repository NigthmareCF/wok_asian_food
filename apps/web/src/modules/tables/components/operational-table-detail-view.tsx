"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { CircleAlert, RefreshCw } from "lucide-react";
import { usePickupResource } from "@/modules/client-order-tracking/use-pickup-resource";
import {
  isOperationalTable,
  isOperationalTables,
} from "@/modules/tables/live-contract";
import styles from "./operational-tables.module.css";

const labels = {
  FREE: "Libre",
  OCCUPIED: "Ocupada",
  RESERVED: "Reservada",
  CLEANING: "En limpieza",
  UNAVAILABLE: "No disponible",
} as const;

function message(body: unknown) {
  return body &&
    typeof body === "object" &&
    "message" in body &&
    typeof body.message === "string"
    ? body.message
    : "No pudimos actualizar la mesa.";
}

export function OperationalTableDetailView({ tableId }: { tableId: string }) {
  const resource = usePickupResource(
    "/bff/operational/tables",
    isOperationalTables,
  );
  const inFlight = useRef(false);
  const [sending, setSending] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const table = resource.data?.find((item) => item.id === tableId);

  async function action(kind: "open" | "close") {
    if (inFlight.current || accessDenied || !table) return;
    inFlight.current = true;
    setSending(true);
    setError("");
    setFeedback("");
    try {
      const response = await fetch(
        `/bff/operational/tables/${table.id}/${kind}`,
        { method: "POST", headers: { "X-Request-Id": crypto.randomUUID() } },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 404 || response.status === 409) {
          setError(
            response.status === 404
              ? "La mesa ya no existe. Recargamos el listado."
              : `${message(body)} Recargamos el listado.`,
          );
          resource.reload();
          return;
        }
        if (response.status === 401 || response.status === 403) {
          setAccessDenied(true);
          setError(
            response.status === 401
              ? "Tu sesión venció. Inicia sesión nuevamente."
              : "No tienes permiso para actualizar esta mesa.",
          );
          resource.reload();
          return;
        }
        if (response.status >= 500) throw new Error("Resultado incierto");
        setError(message(body));
        return;
      }
      if (!isOperationalTable(body)) throw new Error("Respuesta inválida.");
      setFeedback(
        kind === "open"
          ? "Mesa abierta."
          : "Mesa cerrada y enviada a limpieza.",
      );
      resource.reload();
    } catch {
      setError(
        "No pudimos confirmar el resultado. Actualizamos la mesa antes de que vuelvas a operar.",
      );
      resource.reload();
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  const visibleError = error || resource.error?.message || "";
  if (!resource.data && !resource.error)
    return (
      <div className="ops-empty-state" role="status">
        <strong>Cargando mesa…</strong>
      </div>
    );
  if (resource.error)
    return (
      <ErrorState
        message={visibleError}
        reload={resource.reload}
        sending={sending}
      />
    );
  if (!table)
    return (
      <div className="ops-empty-state">
        <strong>Mesa no encontrada (404)</strong>
        <Link className="button button--secondary" href="/operation/tables">
          Volver a mesas
        </Link>
      </div>
    );

  const openable =
    table.active && (table.status === "FREE" || table.status === "CLEANING");
  const closable = table.status === "OCCUPIED";
  return (
    <div className="ops-dashboard">
      <header className="ops-page-header">
        <div>
          <Link className="text-action" href="/operation/tables">
            Volver a mesas
          </Link>
          <h1>{table.name}</h1>
          <p>
            {table.capacity} personas · {table.zone}
          </p>
        </div>
      </header>
      {feedback ? <p role="status">{feedback}</p> : null}
      {visibleError ? (
        <ErrorState
          message={visibleError}
          reload={resource.reload}
          sending={sending}
        />
      ) : null}
      <section className="ops-work-panel">
        <dl>
          <dt>Estado</dt>
          <dd>{labels[table.status]}</dd>
          <dt>Disponible</dt>
          <dd>{table.active ? "Sí" : "No"}</dd>
          <dt>Versión</dt>
          <dd>{table.rowVersion}</dd>
          <dt>Última actualización</dt>
          <dd>
            {new Intl.DateTimeFormat("es-GT", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(table.updatedAt))}
          </dd>
          <dt>Cuenta</dt>
          <dd>
            {table.accountName
              ? `${table.accountName} · ${table.accountStatus}`
              : "Sin cuenta abierta"}
          </dd>
        </dl>
        <div className={styles.actions}>
          <button
            className="button button--primary"
            disabled={sending || accessDenied || !openable}
            onClick={() => void action("open")}
            type="button"
          >
            {sending ? "Guardando…" : "Abrir mesa"}
          </button>
          <button
            className="button button--secondary"
            disabled={sending || accessDenied || !closable}
            onClick={() => void action("close")}
            type="button"
          >
            {sending ? "Guardando…" : "Cerrar mesa"}
          </button>
        </div>
      </section>
      <section className="ops-work-panel" aria-labelledby="unavailable-actions">
        <h2 id="unavailable-actions">Acciones no disponibles</h2>
        <p>Estas acciones requieren APIs que todavía no existen.</p>
        <div className={styles.unavailable}>
          {[
            "Unir o separar mesas",
            "Asignar reserva",
            "Trasladar mesa",
            "Dividir o cobrar cuenta",
            "Marcar limpia como libre",
            "Abrir atención presencial",
          ].map((item) => (
            <button disabled key={item} type="button">
              {item}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function ErrorState({
  message,
  reload,
  sending,
}: {
  message: string;
  reload: () => void;
  sending: boolean;
}) {
  return (
    <div className="ops-inline-feedback" role="alert">
      <CircleAlert aria-hidden="true" size={18} />
      <span>{message}</span>
      <button
        className="button button--secondary button--compact"
        disabled={sending}
        onClick={reload}
        type="button"
      >
        <RefreshCw aria-hidden="true" size={16} /> Actualizar
      </button>
    </div>
  );
}
