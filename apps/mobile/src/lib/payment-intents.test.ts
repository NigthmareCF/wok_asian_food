import { describe, expect, it, vi } from "vitest";
import { recoverCurrentPaymentIntents } from "./payment-intents";

describe("recoverCurrentPaymentIntents", () => {
  it("loads payment states only for accepted delivery requests that asked for online payment", async () => {
    const readCurrent = vi.fn(async (requestId: string) => ({ intentId: `intent-${requestId}`, status: "PENDING" }));
    const result = await recoverCurrentPaymentIntents([
      { requestId: "accepted-online", status: "ACCEPTED", paymentPreference: "ONLINE_PAYMENT_REQUESTED" },
      { requestId: "pending-online", status: "PENDING_REVIEW", paymentPreference: "ONLINE_PAYMENT_REQUESTED" },
      { requestId: "accepted-cash", status: "ACCEPTED", paymentPreference: "CASH_ON_DELIVERY" },
    ], readCurrent);

    expect(readCurrent).toHaveBeenCalledExactlyOnceWith("accepted-online");
    expect(result).toEqual({ "accepted-online": { intentId: "intent-accepted-online", status: "PENDING" } });
  });

  it("does not return requests without a persisted intent", async () => {
    const readCurrent = vi.fn(async () => null);
    const result = await recoverCurrentPaymentIntents([
      { requestId: "without-intent", status: "ACCEPTED", paymentPreference: "ONLINE_PAYMENT_REQUESTED" },
    ], readCurrent);

    expect(readCurrent).toHaveBeenCalledExactlyOnceWith("without-intent");
    expect(result).toEqual({});
  });
});
