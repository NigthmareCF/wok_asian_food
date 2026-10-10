import { describe, expect, it } from "vitest";
import { isPickupReceipt } from "./pickup-contract";

const requestId = "11111111-1111-4111-8111-111111111111";
const receipt = {
  requestId,
  status: "ACCEPTED",
  requestedFor: "2026-10-04T18:00:00Z",
  subtotal: 68,
  currency: "GTQ",
  idempotentReplay: false,
};

describe("pickup receipt contract", () => {
  it("accepts a linked operational order with a known status", () => {
    expect(
      isPickupReceipt({ ...receipt, orderId: requestId, orderStatus: "READY" }),
    ).toBe(true);
  });

  it.each([
    { ...receipt, orderId: requestId, orderStatus: "UNKNOWN" },
    { ...receipt, orderId: requestId, orderStatus: null },
    { ...receipt, orderId: null, orderStatus: "READY" },
  ])("rejects an inconsistent linked order response", (value) => {
    expect(isPickupReceipt(value)).toBe(false);
  });
});
