export type PublicMenuItem = {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  currency: string;
  estimatedPreparationSeconds: number;
};

export type PublicMenu = {
  categories: { id: string; name: string; items: PublicMenuItem[] }[];
  asOf: string;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isPublicMenu(value: unknown): value is PublicMenu {
  return (
    record(value) &&
    typeof value.asOf === "string" &&
    Number.isFinite(Date.parse(value.asOf)) &&
    Array.isArray(value.categories) &&
    value.categories.every(
      (category) =>
        record(category) &&
        typeof category.id === "string" &&
        typeof category.name === "string" &&
        Array.isArray(category.items) &&
        category.items.every(
          (item) =>
            record(item) &&
            typeof item.id === "string" &&
            typeof item.name === "string" &&
            (item.description == null ||
              typeof item.description === "string") &&
            typeof item.price === "number" &&
            Number.isFinite(item.price) &&
            item.price >= 0 &&
            typeof item.currency === "string" &&
            /^[A-Z]{3}$/.test(item.currency) &&
            typeof item.estimatedPreparationSeconds === "number" &&
            Number.isFinite(item.estimatedPreparationSeconds) &&
            item.estimatedPreparationSeconds >= 0,
        ),
    )
  );
}
