"use client";

import Link from "next/link";
import { useState } from "react";
import { menuFixtures, type MenuProduct } from "@/data/fixtures/menu";
import { useCart } from "@/modules/cart";
import { getCartRows, getCartSubtotal } from "@/modules/cart/lib/cart";
import { CheckoutView } from "./checkout-view";

export function ClientCheckout({
  products = menuFixtures,
}: {
  products?: readonly MenuProduct[];
}) {
  const { items, service } = useCart();
  const [review, setReview] = useState<{
    signature: string;
    message: string;
  } | null>(null);
  const rows = getCartRows(items, products);
  const subtotal = getCartSubtotal(rows);
  const signature = JSON.stringify([items, service, products]);
  const hasConflict =
    rows.some((row) => row.conflict) ||
    !Number.isSafeInteger(Math.round(subtotal * 100));
  const snapshot = service
    ? {
        service,
        lines: rows.map((row) => ({
          id: row.id,
          quantity: row.quantity,
          title: row.product?.name ?? "Producto no disponible",
          detail:
            row.choices.map((choice) => choice.name).join(" · ") || undefined,
          unitPriceCents: Math.round(row.unitPrice * 100),
          subtotalCents: Math.round(row.subtotal * 100),
        })),
        subtotalCents: Math.round(subtotal * 100),
      }
    : null;

  return (
    <div>
      <Link className="button button--secondary" href="/client/cart">
        Volver al carrito
      </Link>{" "}
      <Link className="button button--secondary" href="/client">
        Inicio de Cliente
      </Link>
      {!rows.length ? (
        <section className="panel">
          <h1>Tu pedido está vacío</h1>
          <p>Agrega productos desde el menú para revisar tu solicitud.</p>
          <Link className="button button--primary" href="/menu">
            Ver menú
          </Link>
        </section>
      ) : !snapshot ? (
        <section className="panel">
          <h1>Selecciona un servicio</h1>
          <p>Vuelve al carrito y elige Mesa, Para recoger o Delivery.</p>
        </section>
      ) : hasConflict ? (
        <section className="panel">
          <h1>Revisa los artículos del carrito</h1>
          <p role="alert">
            Hay productos no disponibles, cantidades u opciones inválidas.
            Corrige el carrito antes de continuar.
          </p>
          <ul>
            {rows
              .filter((row) => row.conflict)
              .map((row) => (
                <li key={row.id}>
                  {row.product?.name ?? "Producto no disponible"}
                </li>
              ))}
          </ul>
        </section>
      ) : (
        <CheckoutView
          snapshot={snapshot}
          confirmationBlocked
          revalidationMessage={
            review?.signature === signature ? review.message : undefined
          }
          actions={{
            onRevalidate: () => {
              const checkedRows = getCartRows(items, products);
              const valid =
                checkedRows.length > 0 &&
                !checkedRows.some((row) => row.conflict);
              setReview({
                signature,
                message: valid
                  ? "Datos locales revisados. La disponibilidad real sigue pendiente de confirmación; no se ha enviado una solicitud."
                  : "Hay artículos que requieren revisión. Vuelve al carrito.",
              });
            },
            // Pendiente de clearCart en C-05: no crear un pedido que no pueda completar el flujo.
            onConfirm: () => {},
          }}
        />
      )}
    </div>
  );
}
