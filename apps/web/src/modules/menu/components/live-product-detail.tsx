"use client";
import Link from "next/link";
import { useState } from "react";
import { usePublicMenu } from "../use-public-menu";
import { useLiveCart } from "@/modules/cart/live-cart-provider";
import { Button } from "@/shared/components/ui/button";
import styles from "./menu-catalog.module.css";
export function LiveProductDetail({ productId }: { productId: string }) {
  const { menu, error, reload } = usePublicMenu();
  const { add } = useLiveCart();
  const [feedback, setFeedback] = useState("");
  const category = menu?.categories.find((entry) =>
    entry.items.some((item) => item.id === productId),
  );
  const product = category?.items.find((item) => item.id === productId);
  return (
    <div className={styles.content}>
      <Link className="text-action" href="/client/menu">
        Volver al menú
      </Link>
      {error ? (
        <div className={styles.empty}>
          <p role="alert">No pudimos consultar el producto.</p>
          <Button onClick={reload}>Reintentar</Button>
        </div>
      ) : !menu ? (
        <p role="status">Consultando producto…</p>
      ) : !product ? (
        <div className={styles.empty}>
          <h1>Producto no publicado</h1>
          <p>
            La disponibilidad cambió. Consulta el menú actual antes de
            continuar.
          </p>
          <Button onClick={reload}>Consultar otra vez</Button>
        </div>
      ) : (
        <article className={`panel ${styles.card}`}>
          <p className={styles.cardContext}>{category?.name}</p>
          <h1>{product.name}</h1>
          <p>{product.description}</p>
          <strong>
            {new Intl.NumberFormat("es-GT", {
              style: "currency",
              currency: product.currency,
            }).format(product.price)}
          </strong>
          {product.estimatedPreparationSeconds > 0 && (
            <p>
              Preparación estimada:{" "}
              {Math.ceil(product.estimatedPreparationSeconds / 60)} min
            </p>
          )}
          <p>
            Agregar al carrito no reserva existencias. El restaurante confirma
            precio y disponibilidad al procesar la solicitud.
          </p>
          <Button
            onClick={async () =>
              setFeedback(
                (await add(product))
                  ? `${product.name} agregado al carrito.`
                  : "No se pudo validar tu sesión o se alcanzó el límite del carrito. Intenta de nuevo.",
              )
            }
          >
            Agregar al carrito
          </Button>
          <p role="status" aria-live="polite">
            {feedback}
          </p>
          <Link href="/client/cart">Ver carrito</Link>
        </article>
      )}
    </div>
  );
}
