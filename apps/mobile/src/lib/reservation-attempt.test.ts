import { describe, expect, it, vi } from "vitest";
import { parsePendingReservationAttempt, resolvePendingReservationAttempt } from "./reservation-attempt";

const now = Date.parse("2026-10-02T12:00:00Z");
const key = "7f8e91ec-4e5b-4f7f-9a32-8955ac3e24d1";
const attempt = { ownerEmail: "client@example.com", body: "{\"guests\":2}", key, savedAt: now };

describe("pending reservation attempt", () => {
  it("reuses the same key only for the same account and exact request body", () => {
    const generatedKey = "fc29c91c-0d35-4a60-9e8b-13c95326b180";
    const createKey = vi.fn(() => generatedKey);
    expect(resolvePendingReservationAttempt(attempt, attempt.ownerEmail, attempt.body, createKey, now)).toBe(attempt);
    expect(resolvePendingReservationAttempt(attempt, attempt.ownerEmail, "changed", createKey, now).key).toBe(generatedKey);
    expect(resolvePendingReservationAttempt(attempt, "other@example.com", attempt.body, createKey, now).ownerEmail).toBe("other@example.com");
    expect(createKey).toHaveBeenCalledTimes(2);
  });

  it("accepts a valid stored attempt and rejects malformed, non-v4, or expired values", () => {
    expect(parsePendingReservationAttempt(JSON.stringify(attempt), now)).toEqual(attempt);
    expect(parsePendingReservationAttempt("not-json", now)).toBeNull();
    expect(parsePendingReservationAttempt(JSON.stringify({ ...attempt, key: "not-a-uuid" }), now)).toBeNull();
    expect(parsePendingReservationAttempt(JSON.stringify({ ...attempt, savedAt: now - 30 * 24 * 60 * 60 * 1000 }), now)).toBeNull();
  });
});
