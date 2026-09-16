"use client";

import Link from "next/link";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { menuFixtures } from "@/data/fixtures/menu";
import { useCart } from "@/modules/cart/cart-provider";
import { getCartRows, getCartSubtotal } from "@/modules/cart/lib/cart";
import { CheckoutView } from "./checkout-view";
import type { CheckoutService, PaymentMethod, PaymentTiming, TipOption } from "../checkout-snapshot";
import { useMemo, useState } from "react";

export function ClientCheckout() {
  const { items, service, beginPendingRequest, pendingRequest } = useCart();
  const [paymentTiming, setPaymentTiming] = useState<PaymentTiming>("now");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [tipPercentage, setTipPercentage] = useState<TipOption>(0);
  const [revalidationMessage, setRevalidationMessage] = useState<string>();
  const rows = getCartRows(items, menuFixtures);
  const selectedService = (service || "table") as CheckoutService;
  const snapshot = useMemo(() => ({
    service: selectedService,
    lines: rows.map((row) => ({
      id: row.id,
      quantity: row.quantity,
      title: row.product?.name ?? "Producto no disponible",
      detail: row.choices.map((choice) => choice.name).join(" · ") || undefined,
      unitPriceCents: Math.round(row.unitPrice * 100),
    })),
    subtotalCents: Math.round(getCartSubtotal(rows) * 100),
    deliveryFeeCents: 0,
    paymentTiming,
    paymentMethod,
    tipPercentage,
    canPayAtTable: selectedService === "table",
    demoTrackingOrderId: "demo-cart-order",
  }), [paymentMethod, paymentTiming, rows, selectedService, tipPercentage]);

  if (!rows.length) {
    return (
      <section aria-labelledby="empty-checkout-title" className="panel">
        <ShoppingBag aria-hidden="true" size={36} />
        <h1 id="empty-checkout-title">Tu pedido está vacío</h1>
        <p>Agrega productos desde el menú para revisar tu solicitud.</p>
        <Link className="button button--primary" href="/menu">Ver menú</Link>
      </section>
    );
  }

  return (
    <>
      <Link className="text-action" href="/client/cart">
        <ArrowLeft aria-hidden="true" size={16} /> Volver al carrito
      </Link>
      <CheckoutView
        actions={{
          onPaymentTimingChange: setPaymentTiming,
          onPaymentMethodChange: setPaymentMethod,
          onTipChange: setTipPercentage,
          onRevalidate: () => setRevalidationMessage("Disponibilidad local revalidada. La solicitud aún no se ha enviado."),
          onConfirm: () => beginPendingRequest(),
        }}
        isPending={Boolean(pendingRequest)}
        revalidationMessage={revalidationMessage}
        snapshot={snapshot}
      />
    </>
  );
}
