"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useInventorySession } from "../inventory-session-provider";
export function InventoryListView() {
  const { items, loading, error, refresh } = useInventorySession();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (status) params.set("status", status);
      void refresh(params.toString());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, status, refresh]);
  if (loading)
    return (
      <main className="inventory-page" aria-busy="true">
        <p role="status">Cargando inventario…</p>
      </main>
    );
  return (
    <main className="inventory-page">
      <header className="ops-page-header inventory-page__header">
        <div>
          <span className="ops-kicker">Operación · Inventario</span>
          <h1>Existencias</h1>
          <p>Cantidades calculadas por el backend.</p>
        </div>
      </header>
      {error ? <p role="alert">{error}</p> : null}
      <section className="inventory-toolbar">
        <input
          aria-label="Buscar inventario"
          placeholder="Buscar por SKU o nombre"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          aria-label="Filtrar estado"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">Todos</option>
          <option value="OK">Disponible</option>
          <option value="LOW">Bajo</option>
          <option value="OUT">Agotado</option>
          <option value="UNTRACKED">Sin seguimiento</option>
        </select>
      </section>
      {items.length === 0 ? (
        <p className="ops-empty-state">No hay existencias para este filtro.</p>
      ) : (
        <section className="inventory-list" aria-label="Existencias">
          {items.map((item) => (
            <Link
              className="inventory-row"
              href={`/operation/inventory/${item.itemId}`}
              key={item.itemId}
            >
              <strong>{item.name}</strong>
              <span>
                {item.sku} · {item.status}
              </span>
              <span>
                {item.quantityOnHand} {item.unit} · disponible{" "}
                {item.quantityAvailable}
              </span>
            </Link>
          ))}
        </section>
      )}
      <p>Compras, proveedores, lotes y edición de recetas siguen pendientes.</p>
    </main>
  );
}
