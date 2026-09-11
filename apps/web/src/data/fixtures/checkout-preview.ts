import type { CheckoutSnapshot } from "@/modules/checkout";

/** Fixture temporal de demostración. No lee ni replica el CartProvider de C-05. */
export const checkoutPreviewSnapshot: CheckoutSnapshot = Object.freeze({
  service: "table",
  lines: Object.freeze([
    Object.freeze({
      id: "demo-wok-teriyaki",
      quantity: 2,
      title: "Wok teriyaki",
      detail: "Pollo · Picante medio",
      unitPriceCents: 13500,
    }),
    Object.freeze({
      id: "demo-tea",
      quantity: 1,
      title: "Té verde frío",
      unitPriceCents: 11500,
    }),
  ]),
  subtotalCents: 38500,
  deliveryFeeCents: 0,
  paymentTiming: "now",
  paymentMethod: "card",
  tipPercentage: 0,
  canPayAtTable: true,
  demoTrackingOrderId: "demo-190",
});
