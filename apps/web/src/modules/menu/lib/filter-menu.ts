import type { MenuCategoryId, MenuProduct } from "@/data/fixtures/menu";

export type MenuFilter = MenuCategoryId | "all";

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim()
    .replace(/\s+/g, " ");
}

export function filterMenu(
  products: readonly MenuProduct[],
  category: MenuFilter,
  query: string,
) {
  const search = normalizeSearch(query);
  return products.filter(
    (product) =>
      (category === "all" || product.categoryId === category) &&
      normalizeSearch(product.name).includes(search),
  );
}
