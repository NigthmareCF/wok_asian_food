export type PublicServiceCapability = {
  code: string;
  status: "ENABLED" | "MANUAL_APPROVAL" | "PAUSED" | "DISABLED";
};

export type ReservationServiceState = "available" | "paused" | "unknown";
export type RequestServiceState = "available" | "manual-approval" | "paused" | "unknown";

export function requestServiceState(capabilities: PublicServiceCapability[] | null, code: string): RequestServiceState {
  if (capabilities === null) return "unknown";
  const service = capabilities.find((capability) => capability.code === code);
  if (!service) return "unknown";
  if (service.status === "PAUSED" || service.status === "DISABLED") return "paused";
  if (service.status === "MANUAL_APPROVAL") return "manual-approval";
  return "available";
}

export function reservationServiceState(capabilities: PublicServiceCapability[] | null): ReservationServiceState {
  const state = requestServiceState(capabilities, "RESERVATIONS");
  return state === "manual-approval" ? "available" : state;
}
