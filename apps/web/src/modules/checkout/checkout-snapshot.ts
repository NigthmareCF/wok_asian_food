export type CheckoutService = "table" | "pickup" | "delivery";
export type CheckoutLineSnapshot = Readonly<{
  id: string;
  quantity: number;
  title: string;
  detail?: string;
  unitPriceCents: number;
  subtotalCents: number;
}>;

/** Resumen derivado del carrito; no presupone tarifas ni métodos de pago. */
export type CheckoutSnapshot = Readonly<{
  service: CheckoutService;
  lines: readonly CheckoutLineSnapshot[];
  subtotalCents: number;
}>;

export type CheckoutActions = Readonly<{
  onRevalidate: () => void;
  onConfirm: () => void;
}>;

/** Limpieza local después de crear satisfactoriamente el pedido Cliente. */
export type CheckoutCartCompletion = Readonly<{
  clearCart: () => void;
}>;

export function formatQuetzales(cents: number) {
  return `Q${(cents / 100).toFixed(2)}`;
}
