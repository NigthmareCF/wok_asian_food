import { describe, expect, it } from "vitest";
import { isValidDisplayName, isValidVerificationCode } from "./account-input-validation";

describe("account input validation", () => {
  it("trims and enforces the backend display-name bounds", () => {
    expect(isValidDisplayName(" E. ")).toBe(true);
    expect(isValidDisplayName(" ")).toBe(false);
    expect(isValidDisplayName("a")).toBe(false);
    expect(isValidDisplayName("a".repeat(100))).toBe(true);
    expect(isValidDisplayName("a".repeat(101))).toBe(false);
  });

  it("requires exactly six decimal digits for verification codes", () => {
    expect(isValidVerificationCode("012345")).toBe(true);
    expect(isValidVerificationCode("12345")).toBe(false);
    expect(isValidVerificationCode("1234567")).toBe(false);
    expect(isValidVerificationCode("12a456")).toBe(false);
  });
});
