/** Transport safety bounds shared by the app's order and reservation request builders. */
export const MAX_DISTINCT_MENU_LINES = 100;

export function canAddDistinctMenuLine(cart: Record<string, number>, menuItemId: string): boolean {
  return Object.hasOwn(cart, menuItemId) || Object.values(cart).filter((quantity) => quantity > 0).length < MAX_DISTINCT_MENU_LINES;
}
