import { PublicMenuItem, ReservationPreorderItem } from "./api";
import { menuModifiersAreValid } from "./menu-options";
import { isValidPositiveApiInteger } from "./quantity-limits";
import { MAX_DISTINCT_MENU_LINES } from "./request-limits";

export function buildReservationPreorderItems(
  products: PublicMenuItem[],
  quantities: Record<string, number>,
  selectedModifiers: Record<string, string[]>,
): ReservationPreorderItem[] {
  const productsById = new Map(products.map((item) => [item.id, item]));
  const selected = Object.entries(quantities).filter(([, quantity]) => quantity > 0);
  if (selected.length > MAX_DISTINCT_MENU_LINES)
    throw new Error(`Puedes incluir hasta ${MAX_DISTINCT_MENU_LINES} productos distintos en la preorden.`);
  return selected.map(([menuItemId, quantity]) => {
    const product = productsById.get(menuItemId);
    if (!product || !isValidPositiveApiInteger(quantity))
      throw new Error("Revisa las cantidades de la preorden.");
    const modifierIds = selectedModifiers[menuItemId] ?? [];
    if (!menuModifiersAreValid(product.modifierGroups, modifierIds))
      throw new Error(`Completa las opciones de ${product.name}.`);
    return { menuItemId, quantity, modifierIds: [...modifierIds].sort() };
  }).sort((left, right) => left.menuItemId.localeCompare(right.menuItemId));
}
