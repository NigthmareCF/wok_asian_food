"use client";

import { Info, Search, SearchX } from "lucide-react";
import { useRef, useState } from "react";
import { menuCategories, type MenuProduct } from "@/data/fixtures/menu";
import { Button } from "@/shared/components/ui/button";
import { FormField } from "@/shared/components/ui/form-field";
import { filterMenu, type MenuFilter } from "../lib/filter-menu";
import { MenuProductCard } from "./menu-product-card";
import styles from "./menu-catalog.module.css";

export function MenuCatalog({
  products,
}: {
  products: readonly MenuProduct[];
}) {
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<MenuFilter>("all");
  const searchRegion = useRef<HTMLDivElement>(null);
  const items = filterMenu(products, selectedCategory, query);
  const category = menuCategories.find(
    (entry) => entry.id === selectedCategory,
  );
  const hasFilters = Boolean(query || selectedCategory !== "all");

  function resetFilters() {
    setQuery("");
    setSelectedCategory("all");
    searchRegion.current?.querySelector("input")?.focus();
  }

  return (
    <div className={styles.catalog}>
      <div className={styles.toolbar}>
        <div
          className={styles.search}
          role="search"
          aria-label="Buscar productos"
          ref={searchRegion}
        >
          <FormField
            id="menu-search"
            label="Buscar en el menú"
            placeholder="Prueba con atún, pollo o matcha"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-controls="menu-results"
          />
          <Search aria-hidden="true" size={20} />
        </div>
        <p className={styles.notice}>
          <Info aria-hidden="true" size={18} />
          La disponibilidad es demostrativa; no refleja existencias reales.
        </p>
      </div>
      <div
        className={styles.filters}
        role="group"
        aria-label="Categorías del menú"
      >
        <button
          type="button"
          aria-pressed={selectedCategory === "all"}
          aria-controls="menu-results"
          onClick={() => setSelectedCategory("all")}
        >
          Todos
        </button>
        {menuCategories.map((entry) => (
          <button
            type="button"
            key={entry.id}
            aria-pressed={selectedCategory === entry.id}
            aria-controls="menu-results"
            onClick={() => setSelectedCategory(entry.id)}
          >
            {entry.name}
          </button>
        ))}
      </div>
      <div className={styles.resultsHeading}>
        <div>
          <h2>{category?.name ?? "Todos los productos"}</h2>
          <p role="status" aria-atomic="true">
            {items.length} {items.length === 1 ? "producto" : "productos"}
            {category ? ` en ${category.name}` : " en el menú"}
            {query.trim() ? ` para «${query.trim()}»` : ""}
          </p>
        </div>
        {hasFilters ? (
          <Button variant="secondary" type="button" onClick={resetFilters}>
            Limpiar filtros
          </Button>
        ) : null}
      </div>
      {category ? (
        <p className={styles.categoryDescription}>{category.description}</p>
      ) : null}
      <section id="menu-results" aria-label="Resultados del menú">
        {items.length ? (
          <div className={styles.grid}>
            {items.map((product) => (
              <MenuProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <SearchX aria-hidden="true" size={32} />
            <h3>
              {query.trim()
                ? "No encontramos productos con esa búsqueda."
                : category
                  ? "Esta categoría aún no tiene productos."
                  : "El menú aún no tiene productos."}
            </h3>
            <p>
              {hasFilters
                ? "Prueba con otro nombre o limpia los filtros para explorar el menú."
                : "Vuelve a consultar el menú más adelante."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
