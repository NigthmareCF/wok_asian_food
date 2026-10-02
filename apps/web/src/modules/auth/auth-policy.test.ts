import { describe, expect, it } from "vitest";
import { canAccessContext, landingPathForRoles } from "./auth-policy";

describe("auth policy", () => {
  it("routes users to the highest privileged channel they own", () => {
    expect(landingPathForRoles(["CLIENT"])).toBe("/client");
    expect(landingPathForRoles(["CLIENT", "OPERATIONAL"])).toBe("/operation");
    expect(landingPathForRoles(["CLIENT", "OPERATIONAL", "ADMIN"])).toBe(
      "/admin",
    );
  });

  it("does not grant one channel from an unrelated role", () => {
    expect(canAccessContext(["CLIENT"], "client")).toBe(true);
    expect(canAccessContext(["CLIENT"], "admin")).toBe(false);
    expect(canAccessContext(["OPERATIONAL"], "operational")).toBe(true);
    expect(canAccessContext(["OPERATIONAL"], "client")).toBe(false);
  });
});
