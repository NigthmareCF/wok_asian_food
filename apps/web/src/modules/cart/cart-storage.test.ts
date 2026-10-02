import { afterEach, describe, expect, it } from "vitest";
import {
  readCartStorage,
  writeCartStorage,
  clearCartStorage,
} from "./cart-storage";

afterEach(() => window.sessionStorage.clear());

describe("cart storage", () => {
  it("restores the guest cart after a full page navigation", () => {
    writeCartStorage({
      items: [
        {
          id: "temporary",
          productId: "maki-tuna",
          quantity: 2,
          selectedOptions: {},
        },
      ],
      service: "pickup",
    });

    expect(readCartStorage()).toMatchObject({
      service: "pickup",
      items: [{ productId: "maki-tuna", quantity: 2 }],
    });
  });

  it("rejects malformed browser data and clears it on logout", () => {
    window.sessionStorage.setItem(
      "wok.cart.v1",
      JSON.stringify({
        items: [{ productId: "maki-tuna", quantity: -2, selectedOptions: {} }],
        service: "pickup",
      }),
    );
    expect(readCartStorage().items).toEqual([]);
    clearCartStorage();
    expect(window.sessionStorage.getItem("wok.cart.v1")).toBeNull();
  });
});
