"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/shared/components/ui/button";
import { FormField } from "@/shared/components/ui/form-field";
import { usePublicMenu } from "../use-public-menu";
import { useLiveCart } from "@/modules/cart/live-cart-provider";
import styles from "./menu-catalog.module.css";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

export function LiveMenuCatalog() {
  const { menu, error, reload } = usePublicMenu();
  const { add } = useLiveCart();
  const [announcement, setAnnouncement] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  if (error)
    return (
      <div className={styles.empty}>
        <p role="alert">No fue posible cargar el menú. Intenta nuevamente.</p>
        <Button onClick={reload}>Reintentar</Button>
      </div>
    );
  if (!menu) return <p role="status">Cargando menú…</p>;

  const items = menu.categories
    .filter((entry) => category === "all" || entry.id === category)
    .flatMap((entry) =>
      entry.items.map((item) => ({ ...item, categoryName: entry.name })),
    )
    .filter((item) => normalize(item.name).includes(normalize(query)));

  return (
    <div className={styles.catalog}>
      <div className={styles.toolbar}>
        <FormField
          id="live-menu-search"
          label="Buscar en el menú"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-controls="live-menu-results"
        />
        <p className={styles.notice}>
          Catálogo del restaurante. La disponibilidad se confirma al procesar tu
          solicitud. Agregar al carrito no reserva existencias ni envía un
          pedido.
        </p>
      </div>
      <div
        className={styles.filters}
        role="group"
        aria-label="Categorías del menú"
      >
        {[{ id: "all", name: "Todos" }, ...menu.categories].map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={category === entry.id}
            aria-controls="live-menu-results"
            onClick={() => setCategory(entry.id)}
          >
            {entry.name}
          </button>
        ))}
      </div>
      <div className={styles.resultsHeading}>
        <p role="status">
          {items.length} {items.length === 1 ? "producto" : "productos"}
        </p>
        {query || category !== "all" ? (
          <Button
            variant="secondary"
            onClick={() => {
              setQuery("");
              setCategory("all");
            }}
          >
            Limpiar filtros
          </Button>
        ) : null}
      </div>
      <p role="status" aria-live="polite">
        {announcement}
      </p>
      <section id="live-menu-results" aria-label="Resultados del menú">
        {items.length ? (
          <div className={styles.grid}>
            {items.map((item) => (
              <article
                key={item.id}
                className={`panel ${styles.card}`}
                aria-labelledby={`live-product-${item.id}`}
              >
                <p className={styles.cardContext}>{item.categoryName}</p>
                {item.imageReference &&
                item.imageReference.startsWith("/menu/dishes/") ? (
                  <Image
                    className={styles.productImage}
                    src={item.imageReference}
                    alt={item.name}
                    width={1000}
                    height={1125}
                    sizes="(max-width: 700px) 90vw, (max-width: 1100px) 45vw, 30vw"
                    loading="lazy"
                  />
                ) : (
                  <div
                    className={styles.productImagePlaceholder}
                    aria-label={`Imagen no disponible para ${item.name}`}
                    role="img"
                  >
                    WOK
                  </div>
                )}
                <div className={styles.cardTitle}>
                  <h3 id={`live-product-${item.id}`}>{item.name}</h3>
                  <strong>
                    {new Intl.NumberFormat("es-GT", {
                      style: "currency",
                      currency: item.currency,
                    }).format(item.price)}
                  </strong>
                </div>
                {item.description ? (
                  <p className={styles.description}>{item.description}</p>
                ) : null}
                {item.estimatedPreparationSeconds > 0 ? (
                  <p className={styles.options}>
                    Preparación estimada:{" "}
                    {Math.ceil(item.estimatedPreparationSeconds / 60)} min
                  </p>
                ) : null}
                <div className={styles.cardFooter}>
                  <Link
                    className="text-action"
                    href={`/client/menu/${item.id}`}
                    aria-label={`Ver detalle de ${item.name}`}
                  >
                    Ver detalle
                  </Link>
                  <Button
                    aria-label={`Agregar ${item.name} al carrito`}
                    onClick={async () => {
                      const added = await add(item);
                      setAnnouncement(
                        added
                          ? `${item.name} agregado al carrito.`
                          : "No se pudo validar tu sesión o se alcanzó el límite del carrito. Intenta de nuevo.",
                      );
                    }}
                  >
                    Agregar al carrito
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <h3>
              {query || category !== "all"
                ? "No encontramos productos con esos filtros."
                : "El menú aún no tiene productos."}
            </h3>
            <p>Consulta más adelante o prueba otra búsqueda.</p>
          </div>
        )}
      </section>
    </div>
  );
}
