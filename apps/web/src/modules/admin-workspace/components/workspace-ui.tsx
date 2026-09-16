"use client";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { navigation } from "@/config/navigation";
import { Button } from "@/shared/components/ui/button";
import { FormField } from "@/shared/components/ui/form-field";
import { StatusBadge } from "@/shared/components/ui/status-badge";
import { useAdminFilter, useAdminWorkspace } from "../session";
import styles from "./workspace.module.css";
export { Button, FormField, styles };
export const money = (value: number) =>
  new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(
    value,
  );
export function Badge({ children }: { children: string }) {
  const good = [
    "Publicado",
    "Vigente",
    "Activo",
    "Recibida",
    "Completada",
    "Correcto",
    "Confirmada",
  ];
  const warning = [
    "No disponible",
    "Restringido",
    "Incidencia",
    "Cancelada",
    "Descartada",
    "Rechazada",
    "Con diferencia",
    "Revisión pendiente",
    "Dependencia inválida",
  ];
  return (
    <StatusBadge
      label={children}
      tone={
        good.includes(children)
          ? "success"
          : warning.includes(children)
            ? "warning"
            : "info"
      }
    />
  );
}
export function Select({
  label,
  value,
  onChange,
  options,
  id,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[] | readonly { value: string; label: string }[];
  id?: string;
  disabled?: boolean;
}) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <label className={styles.field} htmlFor={fieldId}>
      <span>{label}</span>
      <select
        id={fieldId}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((option) =>
          typeof option === "string" ? (
            <option key={option}>{option}</option>
          ) : (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ),
        )}
      </select>
    </label>
  );
}
export function TextArea({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const id = useId();
  return (
    <label className={styles.field} htmlFor={id}>
      <span>{label}</span>
      <textarea
        id={id}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
      />
    </label>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={error ? styles.error : styles.notice}
      role={error ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
export function Workspace({
  id,
  title,
  description,
  actions,
  children,
}: {
  id: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { canManage, setCanManage } = useAdminWorkspace();
  const [scenario, setScenario] = useAdminFilter(`${id}.scenario`, "Normal");
  return (
    <section className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <span className="eyebrow">ADMINISTRACIÓN / {id}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className={styles.actions}>{actions}</div>
      </header>
      <div className={styles.demo}>
        <span>
          Datos simulados · Los cambios se conservan al navegar y se reinician
          al recargar.
        </span>
        <details>
          <summary>Opciones de demostración</summary>
          <div className={styles.toolbar}>
            <Select
              label="Escenario"
              value={scenario}
              onChange={setScenario}
              options={["Normal", "Cargando", "Sin datos", "Error"]}
            />
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={!canManage}
                onChange={(e) => setCanManage(!e.target.checked)}
              />
              Vista de solo lectura
            </label>
          </div>
        </details>
      </div>
      <details className={styles.mobileNavigation}>
        <summary>Ir a otra sección administrativa</summary>
        <nav aria-label="Secciones administrativas">
          {navigation.admin
            .filter((item) => item.featureFlag !== false)
            .map((item) => (
              <Link key={item.route} href={item.route}>
                {item.label}
              </Link>
            ))}
        </nav>
      </details>
      {scenario === "Normal" ? (
        children
      ) : scenario === "Cargando" ? (
        <div role="status" className={styles.empty} aria-busy="true">
          <h2>Cargando información…</h2>
          <Button variant="secondary" onClick={() => setScenario("Normal")}>
            Finalizar carga de ejemplo
          </Button>
        </div>
      ) : (
        <div
          className={styles.empty}
          role={scenario === "Error" ? "alert" : "status"}
        >
          <h2>
            {scenario === "Error"
              ? "No se pudo cargar la información"
              : "No hay datos para mostrar"}
          </h2>
          <p>
            {scenario === "Error"
              ? "Tus cambios de esta sesión siguen disponibles."
              : "Prueba otro filtro o vuelve a los datos de ejemplo."}
          </p>
          <Button variant="secondary" onClick={() => setScenario("Normal")}>
            {scenario === "Error" ? "Reintentar" : "Mostrar datos de ejemplo"}
          </Button>
        </div>
      )}
    </section>
  );
}
export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-modal="true"
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const elements = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        const first = elements[0];
        const last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className={styles.dialogHeader}>
        <h2 id={titleId}>{title}</h2>
        <Button
          variant="secondary"
          aria-label="Cerrar diálogo"
          onClick={onClose}
        >
          Cerrar
        </Button>
      </div>
      {children}
    </dialog>
  );
}
export function Confirm({
  title,
  description,
  onConfirm,
  onClose,
  requireReason = true,
}: {
  title: string;
  description: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
  requireReason?: boolean;
}) {
  const [reason, setReason] = useState("");
  const [done, setDone] = useState(false);
  const locked = useRef(false);
  const { canManage } = useAdminWorkspace();
  return (
    <Dialog title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (locked.current || !canManage || (requireReason && !reason.trim()))
            return;
          locked.current = true;
          setDone(true);
          onConfirm(reason.trim());
          onClose();
        }}
      >
        <p>{description}</p>
        {requireReason && (
          <TextArea
            label="Motivo"
            value={reason}
            onChange={setReason}
            required
          />
        )}
        <div className={styles.actions}>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={done || !canManage || (requireReason && !reason.trim())}
            type="submit"
          >
            Confirmar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
export function FormActions({
  onCancel,
  label = "Guardar cambios",
  disabled = false,
}: {
  onCancel: () => void;
  label?: string;
  disabled?: boolean;
}) {
  const { canManage } = useAdminWorkspace();
  return (
    <div className={styles.actions}>
      <Button type="button" variant="secondary" onClick={onCancel}>
        Cancelar
      </Button>
      <Button type="submit" disabled={!canManage || disabled}>
        {label}
      </Button>
    </div>
  );
}
export function Metrics({
  items,
}: {
  items: { label: string; value: ReactNode }[];
}) {
  return (
    <div className={styles.metrics}>
      {items.map((i) => (
        <article className={styles.metric} key={i.label}>
          <span>{i.label}</span>
          <strong>{i.value}</strong>
        </article>
      ))}
    </div>
  );
}
export function DataTable<T extends { id: string }>({
  id,
  rows,
  columns,
  empty = "No hay resultados con estos filtros.",
}: {
  id: string;
  rows: T[];
  columns: { label: string; render: (row: T) => ReactNode }[];
  empty?: string;
}) {
  const [pageValue, setPage] = useAdminFilter(`${id}.page`, "1");
  const pages = Math.max(1, Math.ceil(rows.length / 6));
  const page = Math.min(pages, Math.max(1, Number(pageValue) || 1));
  const shown = rows.slice((page - 1) * 6, page * 6);
  return (
    <div className={styles.panel}>
      {!rows.length ? (
        <div className={styles.empty} role="status">
          {empty}
        </div>
      ) : (
        <>
          <table className={styles.table}>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th scope="col" key={c.label}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id}>
                  {columns.map((c) => (
                    <td key={c.label} data-label={c.label}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className={styles.pagination}>
            <span>
              {rows.length} registros · Página {page} de {pages}
            </span>
            <div className={styles.actions}>
              <Button
                variant="secondary"
                disabled={page === 1}
                onClick={() => setPage(String(page - 1))}
              >
                Anterior
              </Button>
              <Button
                variant="secondary"
                disabled={page === pages}
                onClick={() => setPage(String(page + 1))}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
export function SearchFilter({
  id,
  statuses,
  placeholder = "Buscar por nombre o ID",
}: {
  id: string;
  statuses?: string[];
  placeholder?: string;
}) {
  const [search, setSearch] = useAdminFilter(`${id}.search`);
  const [status, setStatus] = useAdminFilter(`${id}.status`, "Todos");
  const [sort, setSort] = useAdminFilter(`${id}.sort`, "Ascendente");
  return (
    <div className={styles.toolbar}>
      <FormField
        id={`${id}-search`}
        label="Buscar"
        value={search}
        placeholder={placeholder}
        onChange={(e) => setSearch(e.target.value)}
      />
      {statuses && (
        <Select
          label="Estado"
          value={status}
          onChange={setStatus}
          options={["Todos", ...statuses]}
        />
      )}
      <Select
        label="Orden"
        value={sort}
        onChange={setSort}
        options={["Ascendente", "Descendente"]}
      />
      <Button
        variant="secondary"
        onClick={() => {
          setSearch("");
          setStatus("Todos");
          setSort("Ascendente");
        }}
      >
        Limpiar filtros
      </Button>
    </div>
  );
}
export function useList<T>(
  id: string,
  rows: T[],
  label: (row: T) => string,
  status?: (row: T) => string,
) {
  const [search] = useAdminFilter(`${id}.search`);
  const [selected] = useAdminFilter(`${id}.status`, "Todos");
  const [sort] = useAdminFilter(`${id}.sort`, "Ascendente");
  return rows
    .filter(
      (row) =>
        label(row)
          .toLocaleLowerCase("es")
          .includes(search.trim().toLocaleLowerCase("es")) &&
        (!status || selected === "Todos" || status(row) === selected),
    )
    .sort(
      (a, b) =>
        (sort === "Ascendente" ? 1 : -1) *
        label(a).localeCompare(label(b), "es"),
    );
}
export function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv =
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map(
            (value) =>
              '"' +
              (typeof value === "string" && /^\s*[=+@-]/.test(value)
                ? "'" + value
                : String(value)
              ).replaceAll('"', '""') +
              '"',
          )
          .join(","),
      )
      .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8;" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function submitForm(event: FormEvent, onSubmit: () => void) {
  event.preventDefault();
  onSubmit();
}
