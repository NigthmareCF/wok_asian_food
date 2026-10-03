"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { CircleAlert, CircleCheck, Plus, RefreshCw } from "lucide-react";
import { usePickupResource } from "@/modules/client-order-tracking/use-pickup-resource";
import {
  isOperationalTable,
  isOperationalTables,
  type CreateOperationalTable,
  type OperationalTable,
  type OperationalTableStatus,
} from "@/modules/tables/live-contract";
import styles from "./operational-tables.module.css";

const statuses: OperationalTableStatus[] = [
  "FREE",
  "OCCUPIED",
  "RESERVED",
  "CLEANING",
  "UNAVAILABLE",
];

const statusLabels: Record<OperationalTableStatus, string> = {
  FREE: "Libre",
  OCCUPIED: "Ocupada",
  RESERVED: "Reservada",
  CLEANING: "En limpieza",
  UNAVAILABLE: "No disponible",
};

const emptyDraft: CreateOperationalTable = { name: "", capacity: 1, zone: "" };

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("es-GT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function responseMessage(body: unknown, fallback: string) {
  return body &&
    typeof body === "object" &&
    "message" in body &&
    typeof body.message === "string"
    ? body.message
    : fallback;
}

export function OperationalTablesView() {
  const resource = usePickupResource(
    "/bff/operational/tables",
    isOperationalTables,
  );
  const [status, setStatus] = useState<OperationalTableStatus | "all">("all");
  const [zone, setZone] = useState("all");
  const [active, setActive] = useState("all");
  const [showCreator, setShowCreator] = useState(false);
  const [draft, setDraft] = useState<CreateOperationalTable>(emptyDraft);
  const [sending, setSending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const zones = useMemo(
    () => [...new Set(resource.data?.map((table) => table.zone) ?? [])].sort(),
    [resource.data],
  );
  const tables = useMemo(
    () =>
      (resource.data ?? []).filter(
        (table) =>
          (status === "all" || table.status === status) &&
          (zone === "all" || table.zone === zone) &&
          (active === "all" || table.active === (active === "true")),
      ),
    [active, resource.data, status, zone],
  );

  async function send(
    action: string,
    path: string,
    body?: CreateOperationalTable,
  ) {
    if (sending) return;
    setSending(action);
    setError("");
    setFeedback("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          "X-Request-Id": crypto.randomUUID(),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 404 || response.status === 409) {
          setError(
            response.status === 404
              ? "La mesa ya no está disponible. Recargamos el listado."
              : "El estado de la mesa cambió. Recargamos el listado para evitar sobrescribir cambios.",
          );
          resource.reload();
          return;
        }
        throw new Error(responseMessage(result, "No pudimos guardar la mesa."));
      }
      if (!isOperationalTable(result)) throw new Error("Respuesta inválida.");
      setFeedback(
        action === "create"
          ? "Mesa creada."
          : action === "open"
            ? "Mesa abierta."
            : "Mesa cerrada y enviada a limpieza.",
      );
      setDraft(emptyDraft);
      setShowCreator(false);
      resource.reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No pudimos guardar la mesa.",
      );
    } finally {
      setSending(null);
    }
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send("create", "/bff/operational/tables", draft);
  }

  const visibleError = error || resource.error?.message;

  return (
    <div className="ops-dashboard table-floor">
      <header className="ops-page-header ops-page-header--focused">
        <div>
          <span className="ops-kicker">Estado del salón</span>
          <h1>Mesas</h1>
          <p>
            Consulta y actualiza únicamente el estado disponible en operación.
          </p>
        </div>
        <button
          className="button button--primary button--compact"
          disabled={Boolean(sending)}
          onClick={() => setShowCreator((value) => !value)}
          type="button"
        >
          <Plus aria-hidden="true" size={17} /> Nueva mesa
        </button>
      </header>

      {feedback ? <p role="status">{feedback}</p> : null}
      {visibleError ? (
        <div className="ops-inline-feedback" role="alert">
          <CircleAlert aria-hidden="true" size={18} />
          <span>{visibleError}</span>
          <button
            className="button button--secondary button--compact"
            disabled={Boolean(sending)}
            onClick={resource.reload}
            type="button"
          >
            <RefreshCw aria-hidden="true" size={16} /> Actualizar
          </button>
        </div>
      ) : null}

      {showCreator ? (
        <form
          aria-label="Crear mesa"
          className={`ops-work-panel ${styles.form}`}
          onSubmit={create}
        >
          <label>
            <span>Nombre</span>
            <input
              disabled={Boolean(sending)}
              maxLength={40}
              minLength={1}
              onChange={(event) =>
                setDraft((value) => ({ ...value, name: event.target.value }))
              }
              required
              value={draft.name}
            />
          </label>
          <label>
            <span>Capacidad</span>
            <input
              disabled={Boolean(sending)}
              min={1}
              onChange={(event) =>
                setDraft((value) => ({
                  ...value,
                  capacity: Number(event.target.value),
                }))
              }
              required
              type="number"
              value={draft.capacity}
            />
          </label>
          <label>
            <span>Zona</span>
            <input
              disabled={Boolean(sending)}
              maxLength={40}
              minLength={2}
              onChange={(event) =>
                setDraft((value) => ({ ...value, zone: event.target.value }))
              }
              required
              value={draft.zone}
            />
          </label>
          <button
            className="button button--primary"
            disabled={Boolean(sending)}
            type="submit"
          >
            {sending === "create" ? "Creando…" : "Crear mesa"}
          </button>
        </form>
      ) : null}

      <section className={styles.filters} aria-label="Filtros de mesas">
        <label>
          <span>Estado</span>
          <select
            onChange={(event) =>
              setStatus(event.target.value as OperationalTableStatus | "all")
            }
            value={status}
          >
            <option value="all">Todos</option>
            {statuses.map((item) => (
              <option key={item} value={item}>
                {statusLabels[item]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Zona</span>
          <select
            onChange={(event) => setZone(event.target.value)}
            value={zone}
          >
            <option value="all">Todas</option>
            {zones.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Disponibilidad</span>
          <select
            onChange={(event) => setActive(event.target.value)}
            value={active}
          >
            <option value="all">Todas</option>
            <option value="true">Activas</option>
            <option value="false">Inactivas</option>
          </select>
        </label>
      </section>

      {!resource.data && !resource.error ? (
        <div className="ops-empty-state" role="status">
          <strong>Cargando mesas…</strong>
        </div>
      ) : resource.error ? null : tables.length === 0 ? (
        <div className="ops-empty-state">
          <strong>No hay mesas para estos filtros</strong>
        </div>
      ) : (
        <section className="table-grid" aria-label="Listado de mesas">
          {tables.map((table) => (
            <TableCard
              key={table.id}
              sending={sending}
              table={table}
              onAction={send}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function TableCard({
  table,
  sending,
  onAction,
}: {
  table: OperationalTable;
  sending: string | null;
  onAction: (action: string, path: string) => Promise<void>;
}) {
  const openable = table.status === "FREE" || table.status === "CLEANING";
  const closable = table.status === "OCCUPIED";
  return (
    <article className={`table-card ${styles.card}`}>
      <div>
        <strong>{table.name}</strong>
        <p className={styles.meta}>
          {table.capacity} personas · {table.zone}
        </p>
        <span className="table-state">{statusLabels[table.status]}</span>
      </div>
      <div className={styles.meta}>
        <div>{table.active ? "Activa" : "Inactiva"}</div>
        <div>
          {table.accountName
            ? `${table.accountName} · ${table.accountStatus}`
            : "Sin cuenta abierta"}
        </div>
        <div>Actualizada: {formatUpdatedAt(table.updatedAt)}</div>
      </div>
      <div className={styles.actions}>
        <Link
          className="button button--secondary button--compact"
          href={`/operation/tables/${table.id}`}
        >
          Ver detalle
        </Link>
        <button
          className="button button--primary button--compact"
          disabled={Boolean(sending) || !openable}
          onClick={() =>
            void onAction("open", `/bff/operational/tables/${table.id}/open`)
          }
          type="button"
        >
          {sending === "open" ? "Abriendo…" : "Abrir mesa"}
        </button>
        <button
          className="button button--secondary button--compact"
          disabled={Boolean(sending) || !closable}
          onClick={() =>
            void onAction("close", `/bff/operational/tables/${table.id}/close`)
          }
          type="button"
        >
          {sending === "close" ? "Cerrando…" : "Cerrar mesa"}
        </button>
      </div>
    </article>
  );
}
