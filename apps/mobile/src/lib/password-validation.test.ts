import { describe, expect, it } from "vitest";
import { isValidNewPassword } from "./password-validation";

describe("new password policy", () => {
  it("accepts the server's inclusive 12–128 character range", () => {
    expect(isValidNewPassword("123456789012")).toBe(true);
    expect(isValidNewPassword("a".repeat(128))).toBe(true);
  });

  it("rejects passwords outside the server's allowed range", () => {
    expect(isValidNewPassword("short-pass")).toBe(false);
    expect(isValidNewPassword("a".repeat(129))).toBe(false);
    expect(isValidNewPassword("")).toBe(false);
  });
});
