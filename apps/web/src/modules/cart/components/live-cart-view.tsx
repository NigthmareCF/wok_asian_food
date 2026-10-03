"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { usePublicMenu } from "@/modules/menu/use-public-menu";
import { useLiveCart } from "../live-cart-provider";
import styles from "./cart.module.css";

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("es-GT", { style: "currency", currency }).format(
    amount,
  );
}

export function LiveCartView() {
  const { items, setQuantity, remove } = useLiveCart();
  const { menu, error, reload } = usePublicMenu();
  const [announcement, setAnnouncement] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const products = menu?.categories.flatMap((category) => category.items) ?? [];
  const rows = items.map((item) => ({
    ...item,
    product: products.find((product) => product.id === item.productId),
  }));
  const totals = new Map<string, number>();
  for (const row of rows)
    if (row.product) {
      totals.set(
        row.product.currency,
        (totals.get(row.product.currency) ?? 0) +
          Math.round(row.product.price * 100) * row.quantity,
      );
    }
  const unavailable = Boolean(menu && rows.some((row) => !row.product));

  return (
    <div className={styles.cart}>
      <header className={styles.heading}>
        <h1 ref={heading} tabIndex={-1}>
          Tu pedido
        </h1>
        <Link className="button button--secondary" href="/menu">
          Volver al menú
        </Link>
      </header>
      <p className={styles.notice}>
        Tu carrito se conserva en esta pestaña. Agregar productos no reserva
        existencias ni envía un pedido al restaurante.
      </p>
      <p className={styles.announcement} role="status">
        {announcement}
      </p>
      {!items.length ? (
        <section className={styles.empty}>
          <h2>Tu pedido está vacío</h2>
          <Link className="button button--primary" href="/menu">
            Ver menú
          </Link>
        </section>
      ) : (
        <>
          {error ? (
            <div role="alert">
              <p>
                No pudimos consultar los precios actuales. Tus artículos siguen
                guardados.
              </p>
              <Button onClick={reload}>Reintentar</Button>
            </div>
          ) : !menu ? (
            <p role="status">Consultando precios actuales…</p>
          ) : null}
          <div className={styles.columns}>
            <section
              className={styles.items}
              aria-label="Artículos de tu pedido"
            >
              {rows.map((row) => (
                <article
                  key={row.productId}
                  className={`panel ${styles.item}`}
                  aria-labelledby={`cart-product-${row.productId}`}
                >
                  <div className={styles.itemHeading}>
                    <h2 id={`cart-product-${row.productId}`}>
                      {row.product?.name ?? row.name}
                    </h2>
                  </div>
                  {row.product ? (
                    <p className={styles.unitPrice}>
                      Precio actual:{" "}
                      {money(row.product.price, row.product.currency)}
                    </p>
                  ) : menu ? (
                    <p className={styles.conflict}>
                      Este producto ya no está en el catálogo. Puedes eliminarlo
                      del carrito.
                    </p>
                  ) : (
                    <p>Precio pendiente de consultar.</p>
                  )}
                  <div className={styles.itemControls}>
                    <div className={styles.stepper}>
                      <Button
                        variant="secondary"
                        aria-label={`Disminuir ${row.product?.name ?? row.name}`}
                        disabled={row.quantity <= 1}
                        onClick={() =>
                          setQuantity(row.productId, row.quantity - 1)
                        }
                      >
                        −
                      </Button>
                      <output
                        aria-label={`Cantidad de ${row.product?.name ?? row.name}`}
                        aria-live="polite"
                      >
                        {row.quantity}
                      </output>
                      <Button
                        variant="secondary"
                        aria-label={`Aumentar ${row.product?.name ?? row.name}`}
                        disabled={!row.product || row.quantity >= 100}
                        onClick={() =>
                          setQuantity(row.productId, row.quantity + 1)
                        }
                      >
                        +
                      </Button>
                    </div>
                    <Button
                      variant="secondary"
                      aria-label={`Eliminar ${row.product?.name ?? row.name}`}
                      onClick={() => {
                        remove(row.productId);
                        setAnnouncement(
                          `${row.product?.name ?? row.name} eliminado del carrito.`,
                        );
                        heading.current?.focus();
                      }}
                    >
                      Eliminar
                    </Button>
                  </div>
                  {row.product ? (
                    <div className={styles.itemSubtotal}>
                      <span>Subtotal</span>
                      <strong>
                        {money(
                          (Math.round(row.product.price * 100) * row.quantity) /
                            100,
                          row.product.currency,
                        )}
                      </strong>
                    </div>
                  ) : null}
                </article>
              ))}
            </section>
            <aside className={styles.summary} aria-label="Resumen del carrito">
              <h2>Resumen</h2>
              {menu && !unavailable ? (
                [...totals].map(([currency, cents]) => (
                  <div key={currency} className={styles.total}>
                    <span>Subtotal ({currency})</span>
                    <output
                      aria-label={`Subtotal ${currency}`}
                      aria-live="polite"
                    >
                      {money(cents / 100, currency)}
                    </output>
                  </div>
                ))
              ) : (
                <p>Subtotal pendiente de revisión.</p>
              )}
              {unavailable ? (
                <p className={styles.conflict}>
                  Revisa los productos que ya no están en el catálogo.
                </p>
              ) : null}
              <p className={styles.help}>
                Los precios se consultan al abrir o actualizar el carrito. La
                disponibilidad se confirma al enviar la solicitud.
              </p>
              <Button variant="secondary" onClick={reload}>
                Actualizar precios
              </Button>
              <Link href="/client/delivery">Solicitar delivery</Link>
              <p className={styles.help}>
                Puedes enviar una solicitud para recoger: máximo 20 productos y
                50 unidades de cada uno.
              </p>
              {menu &&
              !unavailable &&
              totals.size === 1 &&
              items.length <= 20 &&
              items.every((item) => item.quantity <= 50) ? (
                <Link
                  className="button button--primary"
                  href="/client/checkout"
                >
                  Solicitar para recoger
                </Link>
              ) : (
                <Button fullWidth disabled>
                  Revisa el carrito para continuar
                </Button>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
