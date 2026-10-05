import { describe, expect, it } from "vitest";
import { legacyReservationDraftKey, reservationStorageKeys } from "./reservation-storage-keys";

describe("reservation storage scopes", () => {
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
