import { describe, expect, it } from "vitest";
import { PublicServiceDay } from "./api";
import { selectedServiceDate, serviceSlotStatus, serviceWindowLabel } from "./service-hours";

const pickup: PublicServiceDay = {
  serviceType: "PICKUP",
  serviceDate: "2026-10-08",
  open: true,
  opensAt: "14:00:00",
  closesAt: "21:30:00",
  timezoneName: "America/Guatemala",
  source: "WEEKLY",
};

describe("published pickup and delivery hours", () => {
  it("extracts a valid Guatemala date from the date-time field", () => {
    expect(selectedServiceDate("2026-10-08T14:00")).toBe("2026-10-08");
    expect(selectedServiceDate("2026-02-30T14:00")).toBeNull();
    expect(selectedServiceDate("2026-10-08T25:00")).toBeNull();
  });

  it("includes opening time and excludes closing time", () => {
    expect(serviceSlotStatus(pickup, "2026-10-08T14:00")).toBe("within-hours");
    expect(serviceSlotStatus(pickup, "2026-10-08T21:29")).toBe("within-hours");
    expect(serviceSlotStatus(pickup, "2026-10-08T21:30")).toBe("outside-hours");
    expect(serviceSlotStatus(pickup, "2026-10-08T13:59")).toBe("outside-hours");
  });

  it("distinguishes closed dates and missing schedule data", () => {
    expect(serviceSlotStatus({ ...pickup, open: false, opensAt: null, closesAt: null, source: "OVERRIDE" },
      "2026-10-08T15:00")).toBe("closed");
    expect(serviceSlotStatus(null, "2026-10-08T15:00")).toBe("unpublished");
    expect(serviceSlotStatus(pickup, "not-a-date")).toBe("invalid");
  });

  it("shows the time range received from the API", () => {
    expect(serviceWindowLabel(pickup)).toBe("14:00–21:30");
    expect(serviceWindowLabel({ ...pickup, open: false, opensAt: null, closesAt: null })).toBeNull();
  });
});
