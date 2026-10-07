import { describe, expect, it } from "vitest";
import { PublicServiceCapability, reservationServiceState } from "./reservation-service-status";

describe("reservation service status", () => {
  it("blocks requests only when the published reservation capability is paused or disabled", () => {
    const capability = (status: PublicServiceCapability["status"]): PublicServiceCapability[] => [
      { code: "RESERVATIONS", status },
    ];

    expect(reservationServiceState(capability("ENABLED"))).toBe("available");
    expect(reservationServiceState(capability("MANUAL_APPROVAL"))).toBe("available");
    expect(reservationServiceState(capability("PAUSED"))).toBe("paused");
    expect(reservationServiceState(capability("DISABLED"))).toBe("paused");
  });

  it("treats missing or unavailable status as unknown instead of claiming the service is open", () => {
    expect(reservationServiceState(null)).toBe("unknown");
    expect(reservationServiceState([])).toBe("unknown");
  });
});
