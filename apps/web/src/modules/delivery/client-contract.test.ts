import { describe, it, expect } from "vitest";
import { parseDeliveryRequest, isDeliveryReceipt } from "./client-contract";
const payload = {
  requestedFor: "2026-12-01T20:00:00Z",
  customerNote: " prueba ",
  items: [{ menuItemId: "11111111-1111-4111-8111-111111111111", quantity: 1 }],
  address: " Dirección demo ",
  reference: "",
  contactPhone: "55550000",
  paymentPreference: "CASH_ON_DELIVERY",
};
describe("delivery contract", () => {
  it("whitelists fields and rejects invented totals", () => {
    expect(parseDeliveryRequest({ ...payload, subtotal: 1 })).toEqual({
      ...payload,
      address: "Dirección demo",
      customerNote: "prueba",
    });
  });
  it.each([
    { address: "a" },
    { contactPhone: "abc" },
    { paymentPreference: "PAID" },
    { items: [{ ...payload.items[0], quantity: 51 }] },
    { items: [payload.items[0], payload.items[0]] },
  ])("rejects invalid request %j", (change) =>
    expect(parseDeliveryRequest({ ...payload, ...change })).toBeNull(),
  );
  it("does not accept pickup receipts as delivery", () =>
    expect(
      isDeliveryReceipt({
        requestId: payload.items[0].menuItemId,
        status: "PENDING_REVIEW",
        requestedFor: payload.requestedFor,
        subtotal: 68,
        currency: "GTQ",
        idempotentReplay: false,
      }),
    ).toBe(false));
});
