import { z } from "zod";
import type { PublicMenu, PublicMenuItem } from "./api";

export const menuItemSchema = z.object({
  id: z.uuid(), name: z.string().min(1), description: z.string().nullable().optional(),
  price: z.number().finite().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/),
  imageReference: z.string().nullable().optional(),
  estimatedPreparationSeconds: z.number().int().nonnegative(), displayOrder: z.number().int(),
});
export const menuSchema = z.object({
  asOf: z.iso.datetime({ offset: true }),
  categories: z.array(z.object({ id: z.uuid(), name: z.string().min(1), displayOrder: z.number().int(), items: z.array(menuItemSchema) })),
});
export const pickupReceiptSchema = z.object({
  requestId: z.uuid(), status: z.enum(["PENDING_REVIEW", "ACCEPTED", "REJECTED", "CANCELLED", "EXPIRED"]),
  requestedFor: z.iso.datetime({ offset: true }), subtotal: z.number().finite().nonnegative(),
  currencyId: z.uuid(), currency: z.string().regex(/^[A-Z]{3}$/), idempotentReplay: z.boolean(), message: z.string(),
});
export function menuProducts(menu: PublicMenu | undefined) {
  return menu?.categories.flatMap((category) => category.items) ?? [];
}
export function formatPrice(item: Pick<PublicMenuItem, "price" | "currency">) {
  return new Intl.NumberFormat("es-GT", { style: "currency", currency: item.currency }).format(item.price);
}
export function imageUri(reference: string | null | undefined) {
  if (!reference) return null;
  try {
    const url = new URL(reference);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
export function cartTotals(products: PublicMenuItem[], items: Record<string, number>) {
  const totals: Record<string, number> = {};
  for (const product of products) if (items[product.id]) {
    totals[product.currency] = (totals[product.currency] ?? 0) + product.price * items[product.id];
  }
  return Object.entries(totals).map(([currency, price]) => ({ currency, price }));
}
