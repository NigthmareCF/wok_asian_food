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
    expect(result).toEqual({ current: { "accepted-online": { intentId: "intent-accepted-online", status: "PENDING" } }, unavailableRequestIds: [] });
  });

  it("does not return requests without a persisted intent", async () => {
    const readCurrent = vi.fn(async () => null);
    const result = await recoverCurrentPaymentIntents([
      { requestId: "without-intent", status: "ACCEPTED", paymentPreference: "ONLINE_PAYMENT_REQUESTED" },
    ], readCurrent);

    expect(readCurrent).toHaveBeenCalledExactlyOnceWith("without-intent");
    expect(result).toEqual({ current: {}, unavailableRequestIds: [] });
  });

  it("keeps successful payment states when one delivery lookup is temporarily unavailable", async () => {
    const readCurrent = vi.fn(async (requestId: string) => {
      if (requestId === "temporarily-unavailable") throw new Error("temporary network failure");
      return { intentId: `intent-${requestId}`, status: "PENDING" };
    });
    const result = await recoverCurrentPaymentIntents([
      { requestId: "available", status: "ACCEPTED", paymentPreference: "ONLINE_PAYMENT_REQUESTED" },
      { requestId: "temporarily-unavailable", status: "ACCEPTED", paymentPreference: "ONLINE_PAYMENT_REQUESTED" },
    ], readCurrent);

    expect(result).toEqual({
      current: { available: { intentId: "intent-available", status: "PENDING" } },
      unavailableRequestIds: ["temporarily-unavailable"],
    });
  });
});
