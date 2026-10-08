import { describe, expect, it, vi } from "vitest";
import { ApiError, PublicServiceDay } from "./api";
import { fetchPublicServiceDay } from "./service-hours-api";

const canonical: PublicServiceDay = {
  serviceType: "PICKUP",
  serviceDate: "2026-10-08",
  open: true,
  opensAt: "14:00:00",
  closesAt: "21:30:00",
  timezoneName: "America/Guatemala",
  source: "OVERRIDE",
};

describe("public service hours API compatibility", () => {
  it("uses the canonical date-range route and returns its date-specific result", async () => {
    const request = vi.fn().mockResolvedValue([canonical]);

    await expect(fetchPublicServiceDay("PICKUP", "2026-10-08", request)).resolves.toEqual(canonical);
    expect(request).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/public/service-hours?serviceType=PICKUP&from=2026-10-08&to=2026-10-08",
    );
  });

  it.each([404, 500])("adapts the integrated path response after route error %i", async (status) => {
    const request = vi.fn()
      .mockRejectedValueOnce(new ApiError("route unavailable", status))
      .mockResolvedValueOnce([{ weekday: 4, opensAt: "14:00:00", closesAt: "22:00:00", timezone: "America/Guatemala" }]);

    await expect(fetchPublicServiceDay("PICKUP", "2026-10-08", request)).resolves.toEqual({
      serviceType: "PICKUP",
      serviceDate: "2026-10-08",
      open: true,
      opensAt: "14:00:00",
      closesAt: "22:00:00",
      timezoneName: "America/Guatemala",
      source: "COMPATIBILITY",
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]?.[0]).toBe("/api/v1/public/service-hours/PICKUP/2026-10-08");
  });

  it("represents a date with no configured legacy window as closed", async () => {
    const request = vi.fn().mockRejectedValueOnce(new ApiError("route unavailable", 404)).mockResolvedValueOnce([]);

    await expect(fetchPublicServiceDay("DELIVERY", "2026-10-12", request)).resolves.toMatchObject({
      serviceType: "DELIVERY",
      serviceDate: "2026-10-12",
      open: false,
      opensAt: null,
      closesAt: null,
      source: "CLOSED",
    });
  });

  it("does not hide authorization or validation errors behind a compatibility request", async () => {
    const request = vi.fn().mockRejectedValue(new ApiError("forbidden", 403));

    await expect(fetchPublicServiceDay("PICKUP", "2026-10-08", request)).rejects.toThrow("forbidden");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("preserves the primary API error if the alternate route also fails", async () => {
    const request = vi.fn()
      .mockRejectedValueOnce(new ApiError("primary failure", 500))
      .mockRejectedValueOnce(new ApiError("legacy failure", 500));

    await expect(fetchPublicServiceDay("PICKUP", "2026-10-08", request)).rejects.toThrow("primary failure");
  });
});
