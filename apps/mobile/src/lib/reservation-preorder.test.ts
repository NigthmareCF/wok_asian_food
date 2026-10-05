import { describe, expect, it } from "vitest";
import { PublicMenuItem } from "./api";
import { buildReservationPreorderItems } from "./reservation-preorder";

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
});
