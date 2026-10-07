import { describe, expect, it } from "vitest";
import { isValidPositiveApiInteger, MAX_API_INTEGER } from "./quantity-limits";

describe("API integer limits", () => {
  it("allows bulk quantities and group sizes above 50", () => {
    expect(isValidPositiveApiInteger(51)).toBe(true);
    expect(isValidPositiveApiInteger(60)).toBe(true);
  });

  it("matches the backend integer range and rejects invalid values", () => {
    expect(isValidPositiveApiInteger(MAX_API_INTEGER)).toBe(true);
    expect(isValidPositiveApiInteger(MAX_API_INTEGER + 1)).toBe(false);
    expect(isValidPositiveApiInteger(0)).toBe(false);
    expect(isValidPositiveApiInteger(1.5)).toBe(false);
    expect(isValidPositiveApiInteger("51")).toBe(false);
  });
});
