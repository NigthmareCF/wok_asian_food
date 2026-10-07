import { parseRestaurantLocalDateTime } from "./restaurant-time";
import type { PublicServiceDay } from "./api";

export type ServiceSlotStatus = "invalid" | "unpublished" | "closed" | "within-hours" | "outside-hours";

export function selectedServiceDate(localDateTime: string): string | null {
  if (!parseRestaurantLocalDateTime(localDateTime)) return null;
  return localDateTime.slice(0, 10);
}

export function serviceSlotStatus(day: PublicServiceDay | null, localDateTime: string): ServiceSlotStatus {
  if (!parseRestaurantLocalDateTime(localDateTime)) return "invalid";
  if (!day || day.serviceDate !== localDateTime.slice(0, 10)) return "unpublished";
  if (!day.open || !day.opensAt || !day.closesAt) return "closed";

  const requestedTime = localDateTime.slice(11, 16);
  const opensAt = day.opensAt.slice(0, 5);
  const closesAt = day.closesAt.slice(0, 5);
  return requestedTime >= opensAt && requestedTime < closesAt ? "within-hours" : "outside-hours";
}

export function serviceWindowLabel(day: PublicServiceDay): string | null {
  if (!day.open || !day.opensAt || !day.closesAt) return null;
  return `${day.opensAt.slice(0, 5)}–${day.closesAt.slice(0, 5)}`;
}
