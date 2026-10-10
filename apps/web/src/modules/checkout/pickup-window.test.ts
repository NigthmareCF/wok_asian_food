import { describe, expect, it } from "vitest";
import {
  isWithinPickupWindow,
  nextPickupWindow,
  pickupInputToInstant,
} from "./pickup-window";

describe("pickup scheduling window", () => {
  it("defaults to the first preparation-safe time during service", () => {
    const window = nextPickupWindow(
      20 * 60,
      new Date("2026-10-04T20:00:00-06:00"),
    );
    expect(window).toEqual({
      min: "2026-10-04T20:30",
      max: "2026-10-04T21:59",
      defaultValue: "2026-10-04T20:30",
    });
  });

  it("uses opening time when the restaurant opens inside the three-hour horizon", () => {
    expect(
      nextPickupWindow(10 * 60, new Date("2026-10-04T12:30:00-06:00"))?.min,
    ).toBe("2026-10-04T14:00");
  });

  it("returns no slot on Monday or after the daily horizon", () => {
    expect(
      nextPickupWindow(60, new Date("2026-10-05T15:00:00-06:00")),
    ).toBeNull();
    expect(
      nextPickupWindow(60, new Date("2026-10-04T22:05:00-06:00")),
    ).toBeNull();
  });

  it("parses Guatemala local input and rejects values outside the window", () => {
    const window = nextPickupWindow(0, new Date("2026-10-04T18:00:00-06:00"))!;
    expect(pickupInputToInstant("2026-10-04T18:00")?.toISOString()).toBe(
      "2026-10-05T00:00:00.000Z",
    );
    expect(isWithinPickupWindow("2026-10-04T20:00", window)).toBe(true);
    expect(isWithinPickupWindow("2026-10-04T21:30", window)).toBe(false);
  });
});
