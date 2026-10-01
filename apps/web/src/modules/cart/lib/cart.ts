import type { MenuProduct } from "@/data/fixtures/menu";
import {
  configureProduct,
  type ProductSelections,
} from "@/modules/menu/lib/configure-product";

export type CartItem = {
  id: string;
  productId: string;
  quantity: number;
  selectedOptions: ProductSelections;
};
export type CartInput = Omit<CartItem, "id">;

export function addCartItem(
  items: readonly CartItem[],
  input: CartInput,
  products: readonly MenuProduct[],
) {
  const product = products.find((entry) => entry.id === input.productId);
  if (
    !product ||
    !configureProduct(product, input.selectedOptions, input.quantity).canAdd
  )
    return items;
  const selectedOptions = Object.fromEntries(
    (product.options ?? [])
      .flatMap((group) => {
        const selected = input.selectedOptions[group.id];
        return selected ? [[group.id, selected]] : [];
      })
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  const id = JSON.stringify([product.id, selectedOptions]);
  const existing = items.find((entry) => entry.id === id);
  const quantity = input.quantity + (existing?.quantity ?? 0);
  if (!configureProduct(product, selectedOptions, quantity).canAdd)
    return items;
  const next = existing
    ? items.map((entry) => (entry.id === id ? { ...entry, quantity } : entry))
    : [...items, { id, productId: product.id, quantity, selectedOptions }];
  return isSafeCart(next, products) ? next : items;
}

export function getCartRows(
  items: readonly CartItem[],
  products: readonly MenuProduct[],
) {
  return items.map((item) => {
    const product = products.find((entry) => entry.id === item.productId);
    const configuration = product
      ? configureProduct(product, item.selectedOptions, item.quantity)
      : null;
    const unknownOption = Object.entries(item.selectedOptions).some(
      ([groupId, choiceId]) =>
        choiceId &&
        !product?.options?.some(
          (group) =>
            group.id === groupId &&
            group.choices.some((choice) => choice.id === choiceId),
        ),
    );
    return {
      ...item,
      product,
      unitPrice: configuration?.unitPrice ?? 0,
      subtotal: configuration?.total ?? 0,
      choices: configuration?.choices ?? [],
      conflict: !configuration?.canAdd || unknownOption,
    };
  });
}

export type CartRow = ReturnType<typeof getCartRows>[number];
export function getCartSubtotal(rows: readonly CartRow[]) {
  return (
    rows.reduce((cents, row) => cents + Math.round(row.subtotal * 100), 0) / 100
  );
}
function isSafeCart(
  items: readonly CartItem[],
  products: readonly MenuProduct[],
) {
  return Number.isSafeInteger(
    Math.round(getCartSubtotal(getCartRows(items, products)) * 100),
  );
}
export function changeCartQuantity(
  items: readonly CartItem[],
  id: string,
  quantity: number,
  products: readonly MenuProduct[],
) {
  if (!Number.isSafeInteger(quantity) || quantity < 1) return items;
  const next = items.map((entry) =>
    entry.id === id ? { ...entry, quantity } : entry,
  );
  return isSafeCart(next, products) ? next : items;
}
