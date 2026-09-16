import { describe, expect, it } from "vitest";
import { initialAdminState } from "@/data/fixtures/admin-workspace";
import {
  expectedCash,
  receivePurchase,
  recipeError,
  settingsError,
} from "./models";
describe("administrative business safeguards", () => {
  it("rejects receiving an unpurchased request without changing inventory", () => {
    const state = structuredClone(initialAdminState);
    expect(() => receivePurchase(state, "PO-101", [1, 0])).toThrow();
    expect(state).toEqual(initialAdminState);
  });
  it("increments only the delivered quantities and supports a subsequent partial receipt", () => {
    const state = structuredClone(initialAdminState);
    const partial = receivePurchase(state, "PO-102", [4]);
    expect(partial.purchases.find((p) => p.id === "PO-102")?.status).toBe(
      "Parcial",
    );
    expect(partial.ingredients.find((i) => i.id === "ing-4")?.stock).toBe(9);
    const full = receivePurchase(partial, "PO-102", [6]);
    expect(full.purchases.find((p) => p.id === "PO-102")?.status).toBe(
      "Recibida",
    );
    expect(full.ingredients.find((i) => i.id === "ing-4")?.stock).toBe(15);
    expect(state).toEqual(initialAdminState);
    expect(() => receivePurchase(full, "PO-102", [1])).toThrow();
  });
  it.each(
    [[-1], [11], [0], [Number.NaN], [1, 2]].map((quantities) => ({
      quantities,
    })),
  )("rejects invalid receipt %j", ({ quantities }) => {
    expect(() =>
      receivePurchase(initialAdminState, "PO-102", quantities),
    ).toThrow();
  });
  it("validates unknown, duplicate and missing recipe dependencies", () => {
    const recipe = initialAdminState.recipes[1];
    expect(recipeError(recipe, initialAdminState.ingredients)).toBe("");
    expect(
      recipeError({ ...recipe, components: [] }, initialAdminState.ingredients),
    ).not.toBe("");
    expect(
      recipeError(
        { ...recipe, components: [{ ingredientId: "missing", quantity: 1 }] },
        initialAdminState.ingredients,
      ),
    ).not.toBe("");
    expect(
      recipeError(
        { ...recipe, components: [recipe.components[0], recipe.components[0]] },
        initialAdminState.ingredients,
      ),
    ).not.toBe("");
  });
  it("validates configurable values instead of accepting impossible settings", () => {
    expect(settingsError(initialAdminState.settings)).toBe("");
    expect(settingsError({ ...initialAdminState.settings, tip: 101 })).not.toBe(
      "",
    );
    expect(
      settingsError({ ...initialAdminState.settings, reservationLimit: 0 }),
    ).not.toBe("");
    expect(
      settingsError({
        ...initialAdminState.settings,
        opening: "22:00",
        closing: "12:00",
      }),
    ).not.toBe("");
  });
  it("reconciles expected cash including withdrawals and expenses", () => {
    expect(expectedCash(initialAdminState.closings[0])).toBe(970);
    expect(
      initialAdminState.closings[1].counted -
        expectedCash(initialAdminState.closings[1]),
    ).toBe(-20);
  });
});
