import { describe, expect, it } from "vitest";
import {
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  type Permission,
} from "./permissions";

const granted: Permission[] = ["orders.read", "orders.update"];

describe("permission helpers", () => {
  it("checks a single permission", () =>
    expect(hasPermission(granted, "orders.read")).toBe(true));
  it("requires at least one option for any", () =>
    expect(hasAnyPermission(granted, [])).toBe(false));
  it("accepts any matching permission", () =>
    expect(hasAnyPermission(granted, ["users.read", "orders.update"])).toBe(
      true,
    ));
  it("accepts an empty all requirement", () =>
    expect(hasAllPermissions(granted, [])).toBe(true));
  it("rejects when one required permission is missing", () =>
    expect(hasAllPermissions(granted, ["orders.read", "orders.delete"])).toBe(
      false,
    ));
});
