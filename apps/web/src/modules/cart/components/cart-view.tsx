"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Info, ShoppingBag } from "lucide-react";
import { menuFixtures, type MenuProduct } from "@/data/fixtures/menu";
import { cartServiceOptions } from "@/data/fixtures/cart";
import { Button } from "@/shared/components/ui/button";
import { formatMenuPrice } from "@/modules/menu/lib/product-presentation";
import { useCart } from "../cart-provider";
import { getCartRows, getCartSubtotal } from "../lib/cart";
import { CartItemCard } from "./cart-item-card";
import { PendingRequestView } from "./pending-request-view";
import {
  pendingRequestFixture,
  type PendingRequestStatus,
} from "@/data/fixtures/pending-request";
import styles from "./cart.module.css";

type Review = { signature: string; status: "checking" | "ready" | "conflict" };

export function CartView({
  products = menuFixtures,
  initialPendingStatus = pendingRequestFixture.initialStatus,
}: {
  products?: readonly MenuProduct[];
  initialPendingStatus?: PendingRequestStatus;
}) {
  const {
    items,
    service,
    setService,
    setQuantity,
    removeItem,
    pendingRequest,
    beginPendingRequest,
    cancelPendingRequest,
  } = useCart();
  const [showPending, setShowPending] = useState(true);
  const [review, setReview] = useState<Review | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const rows = getCartRows(items, products);
  const subtotal = getCartSubtotal(rows);
  const signature = JSON.stringify([items, service, products]);
  const status = review?.signature === signature ? review.status : null;
  const busy = status === "checking";
  const hasConflict = rows.some((row) => row.conflict);
  const pendingVisible = Boolean(
    pendingRequest && showPending && rows.length && !hasConflict,
  );
  const previouslyPending = useRef(false);

  useEffect(() => {
    if (previouslyPending.current && !pendingVisible) heading.current?.focus();
    previouslyPending.current = pendingVisible;
  }, [pendingVisible]);

  // Cancel a pending local check when inputs change or the view unmounts.
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    },
    [signature],
  );

  function continueLocally() {
    if (!items.length || !service || hasConflict || timer.current !== null)
      return;
    if (pendingRequest) {
      setShowPending(true);
      return;
    }
    setReview({ signature, status: "checking" });
    timer.current = setTimeout(() => {
      const conflicts = getCartRows(items, products).some(
        (row) => row.conflict,
      );
      setReview({ signature, status: conflicts ? "conflict" : "ready" });
      if (!conflicts) {
        beginPendingRequest(initialPendingStatus);
        setShowPending(true);
      }
      timer.current = null;
    }, 650);
  }

  if (pendingVisible && pendingRequest) {
    return (
      <PendingRequestView
        request={pendingRequest}
        rows={rows}
        onReturn={() => setShowPending(false)}
        onCancel={() => {
          cancelPendingRequest();
          setReview(null);
          setAnnouncement(
            "Espera cancelada. Tus artículos y opciones siguen en el carrito.",
          );
        }}
      />
    );
  }

  return (
    <div className={styles.cart}>
      <header className={styles.heading}>
        <div>
          <span className="eyebrow">WOK ASIAN FOOD</span>
          <h1 ref={heading} tabIndex={-1}>
            Tu pedido
          </h1>
        </div>
        <Link className="button button--secondary" href="/menu">
          <ArrowLeft aria-hidden="true" size={18} />
          Volver al menú
        </Link>
      </header>
      <p className={styles.notice}>
        <Info aria-hidden="true" size={18} />
        Carrito local demostrativo: se vacía al recargar. Agregar no reserva
        disponibilidad; deberá revalidarse antes de confirmar.
      </p>
      <p className={styles.announcement} role="status">
        {announcement}
      </p>
      {!rows.length ? (
        <section className={styles.empty}>
          <ShoppingBag aria-hidden="true" size={36} />
          <h2>Tu pedido está vacío</h2>
          <p>Explora el menú y configura tus productos para agregarlos aquí.</p>
          <Link className="button button--primary" href="/menu">
            Ver menú
          </Link>
        </section>
      ) : (
        <div className={styles.columns}>
          <section
            aria-label="Artículos de tu pedido"
            className={styles.items}
            aria-busy={busy}
          >
            {rows.map((row) => (
              <CartItemCard
                key={row.id}
                row={row}
                busy={busy}
                onQuantity={(quantity) => {
                  setQuantity(row.id, quantity);
                  setAnnouncement("");
                }}
                onRemove={() => {
                  removeItem(row.id);
                  setAnnouncement(
                    `${row.product?.name ?? "Artículo"} eliminado de tu pedido.`,
                  );
                  heading.current?.focus();
                }}
              />
            ))}
          </section>
          <aside className={styles.summary} aria-labelledby="cart-summary">
            <h2 id="cart-summary">Resumen</h2>
            <div className={styles.total}>
              <span>Subtotal</span>
              <output aria-label="Subtotal del pedido" aria-live="polite">
                {formatMenuPrice(subtotal)}
              </output>
            </div>
            <fieldset className={styles.services} disabled={busy}>
              <legend>
                Tipo de servicio <span>Selección demostrativa</span>
              </legend>
              {cartServiceOptions.map((option) => (
                <label key={option.id}>
                  <input
                    type="radio"
                    name="cart-service"
                    value={option.id}
                    checked={service === option.id}
                    onChange={() => setService(option.id)}
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>
            <p className={styles.help} id="cart-help">
              {hasConflict
                ? "Elimina los artículos con conflictos para continuar."
                : !service
                  ? "Selecciona un tipo de servicio para continuar."
                  : "Continuar revisa solo los datos locales. El restaurante aún no ha recibido ni aceptado este pedido."}
            </p>
            {pendingRequest ? (
              <p className={styles.help}>
                Tu solicitud sigue pendiente. Puedes retomarla; si modificas el
                carrito se abandona esa espera y deberás revisarlo de nuevo.
              </p>
            ) : null}
            <Button
              fullWidth
              type="button"
              disabled={busy || hasConflict || !service}
              onClick={continueLocally}
              aria-describedby="cart-help"
            >
              {busy
                ? "Revalidando disponibilidad…"
                : pendingRequest
                  ? "Ver solicitud pendiente"
                  : "Continuar"}
            </Button>
            <Link className="button button--secondary" href="/client/checkout">
              Revisar solicitud
            </Link>
            <div className={styles.review} role="status" aria-atomic="true">
              {busy
                ? "Revalidando disponibilidad… Comprobación local demostrativa."
                : hasConflict || status === "conflict"
                  ? "Hay artículos que requieren revisión. No se puede avanzar."
                  : null}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
