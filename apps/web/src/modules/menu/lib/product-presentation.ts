import { Coffee, Fish, Plus, Soup, Wine } from "lucide-react";

export const menuCategoryIcons = {
  sushi: Fish,
  specialties: Soup,
  drinks: Coffee,
  extras: Plus,
  alcohol: Wine,
};

export const menuAvailabilityLabels = {
  available: "Disponible",
  limited: "Disponibilidad limitada",
  unavailable: "No disponible",
};

export function formatMenuPrice(price: number) {
  return `Q${Number.isInteger(price) ? price : price.toFixed(2)}`;
}
