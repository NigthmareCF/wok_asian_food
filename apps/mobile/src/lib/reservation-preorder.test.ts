import { describe, expect, it } from "vitest";
import { PublicMenuItem } from "./api";
import { buildReservationPreorderItems } from "./reservation-preorder";
import { MAX_DISTINCT_MENU_LINES } from "./request-limits";

const product: PublicMenuItem = {
  id: "dish-1", name: "Plato de prueba", price: 45, currency: "GTQ", estimatedPreparationSeconds: 600,
  displayOrder: 1, modifierGroups: [{ id: "group-1", name: "Tamaño", minSelection: 1, maxSelection: 1,
    required: true, displayOrder: 1, options: [{ id: "modifier-1", name: "Grande", priceDelta: 5 }] }],
};

describe("reservation pre-order payload", () => {
  it("creates stable item lines and sorts modifier ids", () => {
    expect(buildReservationPreorderItems([product], { "dish-1": 2 }, { "dish-1": ["modifier-1"] }))
      .toEqual([{ menuItemId: "dish-1", quantity: 2, modifierIds: ["modifier-1"] }]);
  });

  it("rejects missing required modifiers and unknown products", () => {
    expect(() => buildReservationPreorderItems([product], { "dish-1": 1 }, {})).toThrow("Completa las opciones");
    expect(() => buildReservationPreorderItems([], { "missing": 1 }, {})).toThrow("Revisa las cantidades");
  });

  it("supports bulk quantities above the previous client-side cap", () => {
    expect(buildReservationPreorderItems([product], { "dish-1": 51 }, { "dish-1": ["modifier-1"] }))
      .toEqual([{ menuItemId: "dish-1", quantity: 51, modifierIds: ["modifier-1"] }]);
  });

  it("allows over 20 distinct pre-order lines up to the shared transport bound", () => {
    const products = Array.from({ length: 21 }, (_, index) => ({ ...product, id: `dish-${index}` }));
    const quantities = Object.fromEntries(products.map((item) => [item.id, 1]));
    const modifiers = Object.fromEntries(products.map((item) => [item.id, ["modifier-1"]]));
    expect(buildReservationPreorderItems(products, quantities, modifiers)).toHaveLength(21);
  });

  it("rejects pre-orders beyond the shared 100-line transport bound", () => {
    const products = Array.from({ length: MAX_DISTINCT_MENU_LINES + 1 }, (_, index) => ({ ...product, id: `dish-${index}` }));
    const quantities = Object.fromEntries(products.map((item) => [item.id, 1]));
    expect(() => buildReservationPreorderItems(products, quantities, {})).toThrow("hasta 100 productos distintos");
  });

  it("rejects quantities outside the backend integer range", () => {
    expect(() => buildReservationPreorderItems([product], { "dish-1": 2_147_483_648 }, { "dish-1": ["modifier-1"] }))
      .toThrow("Revisa las cantidades de la preorden.");
  });
});
