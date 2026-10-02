import { describe, expect, it } from "vitest";
import {
  canAccessContext,
  landingPathForRoles,
  postLoginDestination,
} from "./auth-policy";

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

  it("returns to an allowed private route without accepting external or foreign destinations", () => {
    expect(postLoginDestination("/client/cart", ["CLIENT"])).toBe(
      "/client/cart",
    );
    expect(postLoginDestination("/client/orders?from=menu", ["CLIENT"])).toBe(
      "/client/orders?from=menu",
    );
    expect(postLoginDestination("/admin/users", ["CLIENT"])).toBe("/client");
    expect(postLoginDestination("//example.com", ["CLIENT"])).toBe("/client");
    expect(postLoginDestination("/client/../admin", ["CLIENT"])).toBe(
      "/client",
    );
    expect(postLoginDestination("/operation/kitchen", ["ADMIN"])).toBe(
      "/admin",
    );
    expect(postLoginDestination("/operation/kitchen", ["OPERATIONAL"])).toBe(
      "/operation/kitchen",
    );
  });
});
