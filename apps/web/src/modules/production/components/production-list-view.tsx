"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Beaker,
  CheckCircle2,
  Clock3,
  Search,
  X,
} from "lucide-react";
import {
  productionCategories,
  productionStatusMeta,
  getProductionSummary,
} from "@/data/fixtures/production";
import { useProductionSession } from "../production-session-provider";

type StatusFilter = "all" | "pending" | "active" | "resting" | "completed" | "discarded";

const statusFilterOptions: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendientes" },
  { value: "active", label: "Activos" },
  { value: "resting", label: "Reposo" },
  { value: "completed", label: "Completados" },
  { value: "discarded", label: "Descartados" },
];

export function ProductionListView() {
  const { batches, suggestions } = useProductionSession();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("Todos");
  const [query, setQuery] = useState("");
  const summary = getProductionSummary(batches);
  const pendingSuggestions = suggestions.filter((s) => s.status === "pending");

  const visibleBatches = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es");
    return batches.filter((batch) => {
      const matchesStatus =
        statusFilter === "all" || batch.status === statusFilter;
      const matchesCategory =
        categoryFilter === "Todos" || batch.category === categoryFilter;
      const matchesQuery =
        !normalizedQuery ||
        batch.recipeName.toLocaleLowerCase("es").includes(normalizedQuery) ||
        batch.category.toLocaleLowerCase("es").includes(normalizedQuery) ||
        batch.responsible.toLocaleLowerCase("es").includes(normalizedQuery);
      return matchesStatus && matchesCategory && matchesQuery;
    });
  }, [batches, statusFilter, categoryFilter, query]);

  const getCount = (value: StatusFilter) =>
    batches.filter((b) =>
      value === "all" ? true : b.status === value,
    ).length;

  return (
    <div className="production-page">
      <header className="ops-page-header production-page__header">
        <div>
          <span className="ops-kicker">Módulo operativo</span>
          <h1>Producción</h1>
          <p>Registra lotes, controla rendimiento y gestiona sugerencias.</p>
        </div>
      </header>

      <section className="production-summary" aria-label="Resumen de producción">
        <div>
          <span>Total</span>
          <strong>{summary.total}</strong>
        </div>
        <div>
          <span>Activos</span>
          <strong className="text-warning">{summary.active}</strong>
        </div>
        <div>
          <span>Completados</span>
          <strong className="text-success">{summary.completed}</strong>
        </div>
        <div className="production-summary__danger">
          <span>Descartados</span>
          <strong className="text-danger">{summary.discarded}</strong>
        </div>
      </section>

      {pendingSuggestions.length > 0 && (
        <section className="production-suggestions" aria-label="Sugerencias pendientes">
          <div className="ops-section-heading">
            <div>
              <h2>
                <AlertTriangle aria-hidden="true" className="ops-heading-icon" />{" "}
                Sugerencias ({pendingSuggestions.length})
              </h2>
              <p>Sugerencias de producción pendientes de revisión</p>
            </div>
          </div>
          <div className="production-suggestion-list">
            {pendingSuggestions.map((sug) => {
              const priorityMeta = {
                high: { label: "Alta", tone: "danger" as const },
                medium: { label: "Media", tone: "warning" as const },
                low: { label: "Baja", tone: "info" as const },
              }[sug.priority];
              return (
                <div className="production-suggestion" key={sug.id}>
                  <div className="production-suggestion__info">
                    <strong>{sug.recipeName}</strong>
                    <span>{sug.reason}</span>
                  </div>
                  <div className="production-suggestion__meta">
                    <span>
                      {sug.suggestedQuantity} {sug.unit}
                    </span>
                    <span
                      className={`production-priority production-priority--${priorityMeta.tone}`}
                    >
                      {priorityMeta.label}
                    </span>
                  </div>
                  <div className="production-suggestion__actions">
                    <Link
                      className="button button--primary button--compact"
                      href={`/operation/production/suggestion/${sug.id}`}
                    >
                      Revisar
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="production-workspace" aria-labelledby="batch-list-title">
        <div className="production-toolbar">
          <div className="production-filter" aria-label="Filtrar por estado">
            {statusFilterOptions.map((item) => (
              <button
                aria-pressed={statusFilter === item.value}
                key={item.value}
                onClick={() => setStatusFilter(item.value)}
                type="button"
              >
                {item.label} <span>{getCount(item.value)}</span>
              </button>
            ))}
          </div>
          <div className="production-toolbar__row">
            <select
              aria-label="Filtrar por categoría"
              className="production-category-select"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              {productionCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <label className="production-search">
              <Search aria-hidden="true" size={18} />
              <span className="sr-only">Buscar batches</span>
              <input
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar receta, categoría..."
                type="search"
                value={query}
              />
            </label>
          </div>
        </div>

        <div className="ops-section-heading">
          <div>
            <h2 id="batch-list-title">
              {statusFilterOptions.find((f) => f.value === statusFilter)?.label}{" "}
              — {categoryFilter}
            </h2>
            <p>{visibleBatches.length} resultados con datos simulados</p>
          </div>
        </div>

        <div className="production-list">
          {visibleBatches.map((batch) => {
            const status = productionStatusMeta[batch.status];
            return (
              <Link
                aria-label={`Abrir batch ${batch.recipeName}, estado ${status.label}`}
                className={`production-row production-row--${status.tone}`}
                href={`/operation/production/${batch.id}`}
                key={batch.id}
              >
                <div className="production-row__identity">
                  <span className="production-row__icon">
                    <Beaker aria-hidden="true" size={18} />
                  </span>
                  <div>
                    <strong>{batch.recipeName}</strong>
                    <span>{batch.category}</span>
                  </div>
                </div>
                <div className="production-row__quantity">
                  <strong>
                    {batch.quantityActual || "—"} / {batch.quantityExpected}{" "}
                    {batch.unit}
                  </strong>
                  <span>
                    {batch.status === "completed"
                      ? `${batch.yieldPercent}% rendimiento`
                      : batch.status === "active"
                        ? `Inicio: ${batch.startedAt}`
                        : batch.status === "resting"
                          ? `Reposo hasta: ${batch.restingUntil || "—"}`
                          : batch.status === "discarded"
                            ? "Descartado"
                            : `Esperando: ${batch.responsible}`}
                  </span>
                </div>
                <div className="production-row__responsible">
                  <strong>{batch.responsible}</strong>
                  <span>{batch.startedAt || "—"}</span>
                </div>
                <span
                  className={`production-status production-status--${status.tone}`}
                >
                  {status.label}
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="production-row__arrow"
                  size={18}
                />
              </Link>
            );
          })}
        </div>

        {visibleBatches.length === 0 && (
          <div className="ops-empty-state">
            <strong>No encontramos batches</strong>
            <span>Prueba otro filtro o cambia la búsqueda.</span>
          </div>
        )}
      </section>

      <p className="mock-disclaimer">
        Los datos de producción son simulados; se reinician al recargar.
      </p>
    </div>
  );
}
