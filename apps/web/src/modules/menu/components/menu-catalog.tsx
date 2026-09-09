"use client";

import { Search, UtensilsCrossed } from "lucide-react";
import { useMemo, useState } from "react";
import { menuFixtures } from "@/data/fixtures/menu";
import { StatusBadge } from "@/shared/components/ui/status-badge";

export function MenuCatalog() {
  const [query, setQuery] = useState("");
  const items = useMemo(
    () =>
      menuFixtures.filter((item) =>
        item.name
          .toLocaleLowerCase("es")
          .includes(query.trim().toLocaleLowerCase("es")),
      ),
    [query],
  );

  return (
    <>
      <div className="catalog-toolbar">
        <label className="field">
          <span>Buscar en el menu</span>
          <input
            className="search-input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nombre del platillo"
            type="search"
            value={query}
          />
        </label>
      </div>
      {items.length ? (
        <section className="catalog-grid" aria-label="Resultados del menu">
          {items.map((item) => (
            <article className="panel catalog-item" key={item.id}>
              <div className="catalog-item__top">
                <UtensilsCrossed aria-hidden="true" size={24} />
                <StatusBadge
                  label={item.availability}
                  tone={
                    item.availability === "Disponible" ? "success" : "warning"
                  }
                />
              </div>
              <div>
                <h2>{item.name}</h2>
                <p>{item.description}</p>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="empty-state">
          <Search aria-hidden="true" size={30} />
          <h2>Sin resultados</h2>
          <p>Prueba con otro nombre.</p>
        </section>
      )}
    </>
  );
}
