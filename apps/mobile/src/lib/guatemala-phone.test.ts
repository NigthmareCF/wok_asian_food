import { describe, expect, it } from "vitest";
import { formatGuatemalaPhone, isValidGuatemalaPhone } from "./guatemala-phone";

describe("Guatemala phone input", () => {
  it("formats local and country-prefixed values in four-digit groups", () => {
    expect(formatGuatemalaPhone("55550101")).toBe("5555 0101");
    expect(formatGuatemalaPhone("+502 5555-0101")).toBe("5555 0101");
    expect(isValidGuatemalaPhone("5555 0101")).toBe(true);
  });

  it("rejects incomplete numbers", () => {
    expect(isValidGuatemalaPhone("5555 010")).toBe(false);
    expect(isValidGuatemalaPhone("123 4567")).toBe(false);
    expect(isValidGuatemalaPhone("")).toBe(false);
    expect(isValidGuatemalaPhone("1234 5678 9")).toBe(false);
  });
});
