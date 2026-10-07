export type PublicServiceCapability = {
  code: string;
  status: "ENABLED" | "MANUAL_APPROVAL" | "PAUSED" | "DISABLED";
};

export type ReservationServiceState = "available" | "paused" | "unknown";

export function reservationServiceState(capabilities: PublicServiceCapability[] | null): ReservationServiceState {
  if (capabilities === null) return "unknown";
  const reservations = capabilities.find((capability) => capability.code === "RESERVATIONS");
  if (!reservations) return "unknown";
  return reservations.status === "PAUSED" || reservations.status === "DISABLED" ? "paused" : "available";
}
