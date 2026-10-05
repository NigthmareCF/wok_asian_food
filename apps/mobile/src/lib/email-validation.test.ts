import { describe, expect, it } from "vitest";
import { isValidEmail, normalizeEmail } from "./email-validation";

describe("email input validation", () => {
  it("trims surrounding whitespace and accepts ordinary email addresses", () => {
    expect(normalizeEmail("  edgar@example.com  ")).toBe("edgar@example.com");
    expect(isValidEmail("  edgar@example.com  ")).toBe(true);
    expect(isValidEmail("nombre.apellido+pedidos@wok.com.gt")).toBe(true);
  });

  it.each([
    "",
    "sin-arroba.example.com",
    "usuario@",
    "usuario@wok",
    "usuario @wok.com",
    "usuario..nombre@wok.com",
    "usuario@-wok.com",
    "usuario@wok-.com",
    `${"a".repeat(65)}@wok.com`,
    `${"a".repeat(245)}@wok.com`,
  ])("rejects malformed or overlong address %j", (value) => {
    expect(isValidEmail(value)).toBe(false);
  });
});
