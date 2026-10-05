import { describe, expect, it } from "vitest";
import { commerceStorageKeys } from "./commerce-storage-keys";

describe("commerce storage scopes", () => {
  it("separates channel and account keys without exposing email addresses", () => {
    const pickup = commerceStorageKeys("pickup", "account-hash-a");
    const delivery = commerceStorageKeys("delivery", "account-hash-a");
    const anotherAccount = commerceStorageKeys("pickup", "account-hash-b");

    expect(new Set([pickup.cart, delivery.cart, anotherAccount.cart]).size).toBe(3);
    expect(pickup.pending).toContain("account-hash-a");
    expect(JSON.stringify(pickup)).not.toContain("@");
  });

  it("provides a stable anonymous scope distinct from registered accounts", () => {
    const anonymous = commerceStorageKeys("delivery", "anonymous");
    const registered = commerceStorageKeys("delivery", "account-hash-a");
    expect(anonymous.cart).not.toBe(registered.cart);
  });
});
