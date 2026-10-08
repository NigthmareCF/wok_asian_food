import { describe, expect, it, vi } from "vitest";
import { isOrderQuoteExpired, isOrderQuoteUsable, requestFreshOrderQuote, OrderQuoteState } from "./order-quotes";

const now = Date.parse("2026-10-08T18:00:00.000Z");
const active: OrderQuoteState = { status: "ACTIVE", usable: true, expiresAt: "2026-10-08T18:12:00.000Z" };

describe("order quote expiry", () => {
  it("accepts an active quote only before its exact expiry instant", () => {
    expect(isOrderQuoteUsable(active, now)).toBe(true);
    expect(isOrderQuoteUsable(active, Date.parse(active.expiresAt))).toBe(false);
    expect(isOrderQuoteExpired(active, Date.parse(active.expiresAt))).toBe(true);
  });

  it.each([
    { status: "EXPIRED", usable: false, expiresAt: "2026-10-08T18:12:00.000Z" },
    { status: "ACTIVE", usable: false, expiresAt: "2026-10-08T18:12:00.000Z" },
    { status: "ACTIVE", usable: true, expiresAt: "invalid" },
  ] as const)("rejects stale or unusable quote state %#", (quote) => {
    expect(isOrderQuoteUsable(quote, now)).toBe(false);
  });

  it("does not mistake a consumed quote for an expired quote", () => {
    expect(isOrderQuoteExpired({ ...active, status: "CONSUMED" }, now)).toBe(false);
    expect(isOrderQuoteUsable({ ...active, status: "CONSUMED" }, now)).toBe(false);
  });
});

describe("expired quote retry", () => {
  it("rotates and persists the key before retrying an expired idempotent result", async () => {
    const events: string[] = [];
    const request = vi.fn(async (key: string) => {
      events.push(`request:${key}`);
      return key === "old-quote-key" ? { ...active, status: "EXPIRED" as const, usable: false } : active;
    });
    const persistKey = vi.fn(async (key: string, pending: boolean) => {
      events.push(`persist:${key}:${pending}`);
    });
    const result = await requestFreshOrderQuote(request, "old-quote-key", false, null, () => "new-quote-key", persistKey, () => now);

    expect(result).toEqual({ quote: active, idempotencyKey: "new-quote-key" });
    expect(request.mock.calls).toEqual([["old-quote-key"], ["new-quote-key"]]);
    expect(persistKey.mock.calls).toEqual([["old-quote-key", true], ["new-quote-key", true]]);
    expect(events).toEqual([
      "persist:old-quote-key:true", "request:old-quote-key",
      "persist:new-quote-key:true", "request:new-quote-key",
    ]);
  });

  it("rotates before the first request when the visible quote has already expired", async () => {
    const request = vi.fn().mockResolvedValue(active);
    const persistKey = vi.fn().mockResolvedValue(undefined);
    const result = await requestFreshOrderQuote(request, "old-quote-key", false,
      { ...active, expiresAt: "2026-10-08T17:59:00.000Z" }, () => "fresh-quote-key", persistKey, () => now);

    expect(result.idempotencyKey).toBe("fresh-quote-key");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("fresh-quote-key");
    expect(persistKey).toHaveBeenCalledTimes(1);
    expect(persistKey).toHaveBeenCalledWith("fresh-quote-key", true);
  });

  it("preserves a persisted in-flight key when the previous request had an uncertain result", async () => {
    const request = vi.fn().mockResolvedValue(active);
    const persistKey = vi.fn().mockResolvedValue(undefined);
    const result = await requestFreshOrderQuote(request, "retry-quote-key", true,
      { ...active, status: "EXPIRED", usable: false }, () => "must-not-be-used", persistKey, () => now);

    expect(result.idempotencyKey).toBe("retry-quote-key");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("retry-quote-key");
  });

  it("keeps an uncertain request key reusable after a network failure", async () => {
    const request = vi.fn()
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce(active);
    const persistKey = vi.fn().mockResolvedValue(undefined);

    await expect(requestFreshOrderQuote(request, undefined, false, null, () => "first-quote-key", persistKey, () => now))
      .rejects.toThrow("connection lost");
    expect(persistKey).toHaveBeenCalledWith("first-quote-key", true);

    const retry = await requestFreshOrderQuote(request, "first-quote-key", true, null, () => "rotated-key", persistKey, () => now);
    expect(retry.idempotencyKey).toBe("first-quote-key");
    expect(request.mock.calls).toEqual([["first-quote-key"], ["first-quote-key"]]);
  });

  it("rotates a definitive expired key but keeps the order key independent", async () => {
    const request = vi.fn().mockResolvedValue(active);
    const persistKey = vi.fn().mockResolvedValue(undefined);
    const orderKey = "order-request-key";
    const { idempotencyKey: quoteKey } = await requestFreshOrderQuote(
      request, undefined, false, null, () => "quote-request-key", persistKey, () => now,
    );

    expect(quoteKey).toBe("quote-request-key");
    expect(orderKey).not.toBe(quoteKey);
  });
});
