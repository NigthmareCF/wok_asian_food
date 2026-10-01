import type { MenuProduct } from "@/data/fixtures/menu";

export type ProductSelections = Readonly<Record<string, string>>;

export function configureProduct(
  product: MenuProduct,
  selections: ProductSelections,
  quantity: number,
) {
  const groups = product.options ?? [];
  const choices = groups.flatMap((group) => {
    const choice = group.choices.find(
      (entry) => entry.id === selections[group.id],
    );
    return choice ? [choice] : [];
  });
  const complete = groups.every((group) => {
    const selected = selections[group.id];
    return !selected
      ? !group.required
      : group.choices.some((choice) => choice.id === selected);
  });
  const unitPrice =
    product.price +
    choices.reduce((sum, choice) => sum + choice.priceAdjustment, 0);
  const total = unitPrice * quantity;
  return {
    choices,
    unitPrice,
    total,
    complete,
    canAdd:
      complete &&
      product.availability !== "unavailable" &&
      Number.isSafeInteger(quantity) &&
      quantity >= 1 &&
      Number.isSafeInteger(Math.round(total * 100)),
  };
}
