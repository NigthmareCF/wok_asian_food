import { describe, expect, it } from "vitest";
import { menuFixtures } from "@/data/fixtures/menu";
import {
  addCartItem,
  changeCartQuantity,
  getCartRows,
  getCartSubtotal,
} from "./cart";

const panko = {
  productId: "panko",
  quantity: 2,
  selectedOptions: { "tuna-only": "tuna-only" },
};

describe("Cart calculations", () => {
  it("includes supplements in each unit and merges only identical configurations", () => {
    let items = addCartItem([], panko, menuFixtures);
    expect(getCartSubtotal(getCartRows(items, menuFixtures))).toBe(150);
    items = addCartItem(items, { ...panko, quantity: 1 }, menuFixtures);
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(3);
    items = addCartItem(
      items,
      { ...panko, quantity: 1, selectedOptions: {} },
      menuFixtures,
    );
    expect(items).toHaveLength(2);
    expect(getCartSubtotal(getCartRows(items, menuFixtures))).toBe(295);
  });

  it("normalizes optional empty selections without duplicating lines", () => {
    let items = addCartItem(
      [],
      { ...panko, selectedOptions: {} },
      menuFixtures,
    );
    items = addCartItem(
      items,
      { ...panko, selectedOptions: { "tuna-only": "" } },
      menuFixtures,
    );
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(4);
  });

  it("rejects invalid quantities, missing required bases and unavailable products", () => {
    for (const quantity of [
      0,
      -1,
      1.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER,
    ]) {
      expect(addCartItem([], { ...panko, quantity }, menuFixtures)).toEqual([]);
    }
    expect(
      addCartItem(
        [],
        { ...panko, productId: "orange-chicken", selectedOptions: {} },
        menuFixtures,
      ),
    ).toEqual([]);
    expect(
      addCartItem(
        [],
        { ...panko, productId: "blue-matcha", selectedOptions: {} },
        menuFixtures,
      ),
    ).toEqual([]);
    const items = addCartItem([], panko, menuFixtures);
    expect(changeCartQuantity(items, items[0].id, 0, menuFixtures)).toBe(items);
  });

  it("retains conflicts when product availability or options change", () => {
    const items = addCartItem([], panko, menuFixtures);
    const unavailable = menuFixtures.map((p) =>
      p.id === "panko" ? { ...p, availability: "unavailable" as const } : p,
    );
    const rows = getCartRows(items, unavailable);
    expect(rows).toHaveLength(1);
    expect(rows[0].conflict).toBe(true);
    expect(rows[0].subtotal).toBe(150);
    expect(
      getCartRows(
        items,
        menuFixtures.filter((p) => p.id !== "panko"),
      )[0].conflict,
    ).toBe(true);
    const changed = menuFixtures.map((p) =>
      p.id === "panko" ? { ...p, options: [] } : p,
    );
    expect(getCartRows(items, changed)[0].conflict).toBe(true);
  });
});
