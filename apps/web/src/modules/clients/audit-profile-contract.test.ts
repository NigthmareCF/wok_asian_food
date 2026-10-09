import { it, expect } from "vitest";
import { isClientProfile } from "./profile-contract";
it("AUDIT: actual NON_NULL API profile without phone must be consumable", () => {
  expect(
    isClientProfile({
      userId: "10000000-0000-4000-8000-000000000001",
      email: "audit-a@wok.test",
      displayName: "Audit A",
      version: 1,
    }),
  ).toBe(true);
});
