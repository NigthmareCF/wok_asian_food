import type { PublicMenu, PublicMenuItem } from "./api";
import { imageUri, menuProducts } from "./catalog";

export function homeCarouselProducts(menu: PublicMenu | undefined) {
  return menuProducts(menu).slice(0, 6);
}

export function selectHomeHero(products: PublicMenuItem[]) {
  return (
    products.find((product) => imageUri(product.imageReference)) ??
    products[0] ??
    null
  );
}

export function homeProductRoute(product: PublicMenuItem | null) {
  return product
    ? { pathname: "/menu/[itemId]" as const, params: { itemId: product.id } }
    : ("/(tabs)/menu" as const);
}

export function canHomeQuickAdd({
  ready,
  attempt,
  isFetching,
  isError,
  quantity,
}: {
  ready: boolean;
  attempt: unknown;
  isFetching: boolean;
  isError: boolean;
  quantity: number;
}) {
  return ready && !attempt && !isFetching && !isError && quantity < 50;
}
