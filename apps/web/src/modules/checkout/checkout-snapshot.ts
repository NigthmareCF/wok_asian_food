export type CheckoutService = "table" | "pickup" | "delivery";
export type PaymentTiming = "now" | "at-table";
export type PaymentMethod = "cash" | "card" | "transfer";
export type TipOption = 0 | 5 | 10 | 15;

export type CheckoutLineSnapshot = Readonly<{
  id: string;
  quantity: number;
  title: string;
  detail?: string;
  unitPriceCents: number;
}>;

/**
 * Contrato inmutable entre el carrito real y la vista de checkout.
 * El adaptador futuro de C-05 será el único responsable de construirlo.
 */
export type CheckoutSnapshot = Readonly<{
  service: CheckoutService;
  lines: readonly CheckoutLineSnapshot[];
  subtotalCents: number;
  deliveryFeeCents: number;
  paymentTiming: PaymentTiming;
  paymentMethod: PaymentMethod;
  tipPercentage: TipOption;
  canPayAtTable: boolean;
  demoTrackingOrderId: string;
}>;

export type CheckoutActions = Readonly<{
  onPaymentTimingChange: (timing: PaymentTiming) => void;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  onTipChange: (tip: TipOption) => void;
  onRevalidate: () => void;
  onConfirm: () => void;
}>;

export function formatQuetzales(cents: number) {
  return `Q${(cents / 100).toFixed(2)}`;
}

export function getCheckoutTotalCents(snapshot: CheckoutSnapshot) {
  const tipCents = Math.round(
    (snapshot.subtotalCents * snapshot.tipPercentage) / 100,
  );

  return snapshot.subtotalCents + snapshot.deliveryFeeCents + tipCents;
}
