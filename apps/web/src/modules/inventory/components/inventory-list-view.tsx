"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Box,
  CheckCircle2,
  Clock3,
  Filter,
  Package,
  Search,
  X,
} from "lucide-react";
import {
  inventoryCategories,
  inventoryStatusMeta,
  getInventorySummary,
  formatGTQ,
  type InventoryItemStatus,
} from "@/data/fixtures/inventory";
import { useInventorySession } from "../inventory-session-provider";

const expiryReference = new Date("2026-09-11T06:00:00Z").getTime();

type StatusFilter = "all" | InventoryItemStatus;

const statusFilterOptions: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "available", label: "Disponibles" },
  { value: "low", label: "Bajos" },
  { value: "critical", label: "Críticos" },
  { value: "reserved", label: "Reservados" },
  { value: "expired", label: "Caducados" },
];

export function InventoryListView() {
  const { items } = useInventorySession();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("Todos");
  const [query, setQuery] = useState("");
  const summary = getInventorySummary(items);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es");
    return items.filter((item) => {
      const matchesStatus =
        statusFilter === "all" || item.status === statusFilter;
      const matchesCategory =
        categoryFilter === "Todos" || item.category === categoryFilter;
      const matchesQuery =
        !normalizedQuery ||
        item.name.toLocaleLowerCase("es").includes(normalizedQuery) ||
        item.category.toLocaleLowerCase("es").includes(normalizedQuery) ||
        item.id.toLocaleLowerCase("es").includes(normalizedQuery);
      return matchesStatus && matchesCategory && matchesQuery;
    });
  }, [items, statusFilter, categoryFilter, query]);

  const getCount = (value: StatusFilter) =>
    items.filter((item) =>
      value === "all" ? true : item.status === value,
    ).length;

  return (
    <div className="inventory-page">
      <header className="ops-page-header inventory-page__header">
        <div>
          <span className="ops-kicker">Módulo operativo</span>
          <h1>Inventario</h1>
          <p>Controla stock, lotes, entradas y ajustes de insumos.</p>
        </div>
        <div className="ops-header-actions">
          <Link
            className="button button--primary button--compact"
            href="/operation/inventory/new"
          >
            <Package aria-hidden="true" size={17} /> Nueva entrada
          </Link>
        </div>
      </header>

      <section className="inventory-summary" aria-label="Resumen de inventario">
        <div>
          <span>Total</span>
          <strong>{summary.total}</strong>
        </div>
        <div>
          <span>Disponibles</span>
          <strong className="text-success">{summary.available}</strong>
        </div>
        <div className="inventory-summary__warning">
          <span>Bajos</span>
          <strong className="text-warning">{summary.low}</strong>
        </div>
        <div className="inventory-summary__danger">
          <span>Críticos</span>
          <strong className="text-danger">{summary.critical}</strong>
        </div>
      </section>

      <section className="inventory-workspace" aria-labelledby="inventory-list-title">
        <div className="inventory-toolbar">
          <div className="inventory-filter" aria-label="Filtrar por estado">
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
          <div className="inventory-toolbar__row">
            <select
              aria-label="Filtrar por categoría"
              className="inventory-category-select"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              {inventoryCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <label className="inventory-search">
              <Search aria-hidden="true" size={18} />
              <span className="sr-only">Buscar insumos</span>
              <input
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar insumo, categoría..."
                type="search"
                value={query}
              />
            </label>
          </div>
        </div>

        <div className="ops-section-heading inventory-list-heading">
          <div>
            <h2 id="inventory-list-title">
              {statusFilterOptions.find((f) => f.value === statusFilter)?.label}{" "}
              — {categoryFilter}
            </h2>
            <p>{visibleItems.length} resultados con datos simulados</p>
          </div>
        </div>

        <div className="inventory-list">
          {visibleItems.map((item) => {
            const status = inventoryStatusMeta[item.status];
            return (
              <Link
                aria-label={`Abrir insumo ${item.name}, estado ${status.label}`}
                className={`inventory-row inventory-row--${status.tone}`}
                href={`/operation/inventory/${item.id}`}
                key={item.id}
              >
                <div className="inventory-row__identity">
                  <span className="inventory-row__icon">
                    <Box aria-hidden="true" size={18} />
                  </span>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.category}</span>
                  </div>
                </div>
                <div className="inventory-row__stock">
                  <strong>
                    {item.stock} {item.unit}
                  </strong>
                  <span>
                    Mín: {item.minStock} · Máx: {item.maxStock}
                  </span>
                </div>
                <div className="inventory-row__availability">
                  <strong>
                    {item.available} {item.unit}
                  </strong>
                  <span>
                    {item.reserved > 0
                      ? `${item.reserved} reservados`
                      : "Sin reservas"}
                  </span>
                </div>
                <div className="inventory-row__lots">
                  <strong>{item.lots.length} lotes</strong>
                  <span>
                    {item.lots.some(
                      (l) =>
                        new Date(l.expiryDate).getTime() <
                        expiryReference + 30 * 24 * 60 * 60 * 1000,
                    )
                      ? "Próx. a vencer"
                      : "Vigentes"}
                  </span>
                </div>
                <span
                  className={`inventory-status inventory-status--${status.tone}`}
                >
                  {status.label}
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="inventory-row__arrow"
                  size={18}
                />
              </Link>
            );
          })}
        </div>

        {visibleItems.length === 0 && (
          <div className="ops-empty-state">
            <strong>No encontramos insumos</strong>
            <span>Prueba otro filtro o cambia la búsqueda.</span>
          </div>
        )}
      </section>

      <p className="mock-disclaimer">
        Los datos de inventario son simulados; se reinician al recargar.
      </p>
    </div>
  );
}
