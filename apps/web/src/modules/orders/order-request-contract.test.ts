import { describe, expect, it } from "vitest";
import {
  isOperationalOrderRequests,
  parseOrderRequestDecision,
} from "./order-request-contract";

const id = "11111111-1111-4111-8111-111111111111";

describe("operational order request contract", () => {
  it("accepts a complete request returned by the API", () => {
    expect(
      isOperationalOrderRequests([
        {
          requestId: id,
          status: "PENDING_REVIEW",
          fulfillmentType: "PICKUP",
          requestedFor: "2026-10-05T01:00:00Z",
          submittedAt: "2026-10-05T00:30:00Z",
          customerName: "Cliente",
          customerEmail: "cliente@example.test",
          customerNote: null,
          subtotal: 68,
          currency: "GTQ",
          orderId: null,
          orderStatus: null,
          items: [
            { name: "Gyozas", quantity: 1, unitPrice: 68, lineTotal: 68 },
          ],
        },
      ]),
    ).toBe(true);
  });

  it("requires a reason only when rejecting", () => {
    expect(parseOrderRequestDecision({ action: "ACCEPT" })).toEqual({
      action: "ACCEPT",
    });
    expect(parseOrderRequestDecision({ action: "REJECT" })).toBeNull();
    expect(
      parseOrderRequestDecision({ action: "REJECT", reason: "Sin insumos" }),
    ).toEqual({
      action: "REJECT",
      reason: "Sin insumos",
    });
  });
});
