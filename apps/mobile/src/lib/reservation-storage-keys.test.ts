import { describe, expect, it } from "vitest";
import { legacyReservationDraftKey, normalizeReservationOwnerEmail, reservationStorageKeys } from "./reservation-storage-keys";

describe("reservation storage scopes", () => {
  it("normalizes owner identity despite whitespace or email casing", () => {
    expect(normalizeReservationOwnerEmail("  Fer.Cachy@Wok.Test ")).toBe("fer.cachy@wok.test");
    expect(normalizeReservationOwnerEmail("FER.CACHY@WOK.TEST")).toBe(normalizeReservationOwnerEmail("fer.cachy@wok.test"));
  });

  it("separates reservation drafts and attempts by owner without exposing email", () => {
    const accountA = reservationStorageKeys("hash-a", "attempt-a");
    const accountB = reservationStorageKeys("hash-b", "attempt-b");
    expect(accountA.draft).not.toBe(accountB.draft);
    expect(accountA.attempt).not.toBe(accountB.attempt);
    expect(JSON.stringify(accountA)).not.toContain("@");
  });

  it("keeps the legacy draft key explicit for owner-checked migration", () => {
    expect(legacyReservationDraftKey).toBe("wok.client.reservation-draft.v1");
  });
});
