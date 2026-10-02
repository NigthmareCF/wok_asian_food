"use client";

import { createCheckoutPreviewSnapshot } from "@/data/fixtures/checkout-preview";
import type { CheckoutService } from "../checkout-snapshot";
import { CheckoutView } from "./checkout-view";

/** Composición exclusiva para pruebas; ninguna ruta de Cliente la monta. */
export function CheckoutPreview({ service }: { service: CheckoutService }) {
  return (
    <CheckoutView
      snapshot={createCheckoutPreviewSnapshot(service)}
      actions={{ onRevalidate: () => {}, onConfirm: () => {} }}
    />
  );
}
