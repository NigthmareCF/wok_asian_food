import { describe, expect, it } from "vitest";
import { formatRestaurantDateTime, parseRestaurantLocalDateTime } from "./restaurant-time";

describe("restaurant local time", () => {
  it("converts a Guatemala wall-clock reservation time to an absolute instant", () => {
    expect(parseRestaurantLocalDateTime("2026-10-05T18:30")?.toISOString()).toBe("2026-10-06T00:30:00.000Z");
  });

  it("rejects malformed and impossible local dates", () => {
    expect(parseRestaurantLocalDateTime("2026-02-30T18:30")).toBeNull();
    expect(parseRestaurantLocalDateTime("2026-10-05 18:30")).toBeNull();
    expect(parseRestaurantLocalDateTime("2026-10-05T24:00")).toBeNull();
  });

  it("formats backend instants in Guatemala time regardless of device zone", () => {
    expect(formatRestaurantDateTime("2026-10-06T00:30:00Z")).toContain("18:30");
  });
});
