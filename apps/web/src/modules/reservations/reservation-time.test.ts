import { describe, expect, it } from "vitest";
import { checkReservationNotice } from "./reservation-time";

describe("checkReservationNotice", () => {
  const now = new Date("2026-09-25T14:00:00");

  it("requires three full hours for a formal or digital table request", () => {
    expect(checkReservationNotice("2026-09-25", "16:59", now)).toEqual({
      valid: false,
      reason: "TOO_SOON",
    });
    expect(checkReservationNotice("2026-09-25", "17:00", now)).toEqual({
      valid: true,
    });
  });

  it("rejects invalid calendar dates", () => {
    expect(checkReservationNotice("2026-02-30", "20:00", now)).toEqual({
      valid: false,
      reason: "INVALID_TIME",
    });
  });
});
