import { PublicMenuItem, ReservationPreorderItem } from "./api";
import { menuModifiersAreValid } from "./menu-options";

export function buildReservationPreorderItems(
  products: PublicMenuItem[],
  quantities: Record<string, number>,
  selectedModifiers: Record<string, string[]>,
): ReservationPreorderItem[] {
  const productsById = new Map(products.map((item) => [item.id, item]));
  const selected = Object.entries(quantities).filter(([, quantity]) => quantity > 0);
  if (selected.length > 20) throw new Error("Puedes incluir hasta 20 productos distintos en la preorden.");
  return selected.map(([menuItemId, quantity]) => {
    const product = productsById.get(menuItemId);
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 50)
      throw new Error("Revisa las cantidades de la preorden.");
    const modifierIds = selectedModifiers[menuItemId] ?? [];
    if (!menuModifiersAreValid(product.modifierGroups, modifierIds))
      throw new Error(`Completa las opciones de ${product.name}.`);
    return { menuItemId, quantity, modifierIds: [...modifierIds].sort() };
  }).sort((left, right) => left.menuItemId.localeCompare(right.menuItemId));
}
