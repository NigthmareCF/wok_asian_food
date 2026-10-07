import { describe, expect, it } from "vitest";
import { canAddDistinctMenuLine, MAX_DISTINCT_MENU_LINES } from "./request-limits";

describe("distinct menu request line limit", () => {
  it("allows adding a new product while below the shared bound", () => {
    expect(canAddDistinctMenuLine({ "dish-1": 1 }, "dish-2")).toBe(true);
  });

  it("allows increasing an existing product when the cart is full", () => {
    const cart = Object.fromEntries(Array.from({ length: MAX_DISTINCT_MENU_LINES }, (_, index) => [`dish-${index}`, 1]));
    expect(canAddDistinctMenuLine(cart, "dish-0")).toBe(true);
  });

  it("blocks adding another distinct product when the cart reaches the bound", () => {
    const cart = Object.fromEntries(Array.from({ length: MAX_DISTINCT_MENU_LINES }, (_, index) => [`dish-${index}`, 1]));
    expect(canAddDistinctMenuLine(cart, "dish-over-limit")).toBe(false);
  });
});
