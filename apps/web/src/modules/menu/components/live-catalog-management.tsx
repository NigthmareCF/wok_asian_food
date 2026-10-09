"use client";
import { useState } from "react";
import { usePublicMenu } from "../use-public-menu";
import { Button } from "@/shared/components/ui/button";
import { FormField } from "@/shared/components/ui/form-field";
import styles from "./menu-catalog.module.css";
export function LiveCatalogManagement() {
  const { menu, error, reload } = usePublicMenu();
  const [search, setSearch] = useState("");
  return (
    <div className={styles.catalog}>
      <h1>Catálogo publicado</h1>
      <p>
        Productos y precios que consulta el Cliente. El mantenimiento de
        categorías, precios y disponibilidad está pendiente de un contrato
        administrativo; esta pantalla permite consultar el catálogo actual.
      </p>
      <div className={styles.toolbar}>
        <FormField
          id="admin-catalog-search"
          label="Buscar producto"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button variant="secondary" onClick={reload}>
          Actualizar catálogo
        </Button>
      </div>
      {error ? (
        <p role="alert">No pudimos consultar el catálogo del restaurante.</p>
      ) : !menu ? (
        <p role="status">Consultando catálogo…</p>
      ) : (
        <>
          <p>
            Consulta del servidor: {new Date(menu.asOf).toLocaleString("es-GT")}
          </p>
          {menu.categories.map((category) => (
            <section key={category.id}>
              <h2>{category.name}</h2>
              {category.items
                .filter((item) =>
                  item.name
                    .toLocaleLowerCase("es")
                    .includes(search.toLocaleLowerCase("es").trim()),
                )
                .map((item) => (
                  <article key={item.id}>
                    <h3>{item.name}</h3>
                    <p>{item.description}</p>
                    <p>
                      {new Intl.NumberFormat("es-GT", {
                        style: "currency",
                        currency: item.currency,
                      }).format(item.price)}
                    </p>
                  </article>
                ))}
            </section>
          ))}
          {!menu.categories.some((category) =>
            category.items.some((item) =>
              item.name
                .toLocaleLowerCase("es")
                .includes(search.toLocaleLowerCase("es").trim()),
            ),
          ) && <p>No hay productos publicados para esta búsqueda.</p>}
        </>
      )}
    </div>
  );
}
