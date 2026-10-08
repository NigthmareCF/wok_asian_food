import { z } from "zod";

export const restaurantTimeZone = "America/Guatemala";
const offsetMilliseconds = 6 * 60 * 60 * 1000;
const minuteMilliseconds = 60 * 1000;

// Guatemala civil time is UTC-6; never parse a naked value in the device zone.
export function restaurantLocal(value: Date | number) {
  const instant = typeof value === "number" ? value : value.getTime();
  return new Date(instant - offsetMilliseconds).toISOString().slice(0, 16);
}

export function restaurantInstant(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}:00-06:00`);
  if (!Number.isFinite(timestamp) || restaurantLocal(timestamp) !== value)
    return null;
  return new Date(timestamp).toISOString();
}

export function addRestaurantDays(day: string, delta: number) {
  const instant = restaurantInstant(`${day}T12:00`);
  if (!instant || !Number.isInteger(delta)) return "";
  return restaurantLocal(Date.parse(instant) + delta * 86400000).slice(0, 10);
}

export function restaurantDateLabel(
  day: string,
  options: Intl.DateTimeFormatOptions,
) {
  const instant = restaurantInstant(`${day}T12:00`);
  return instant
    ? new Date(instant).toLocaleDateString("es-GT", {
        ...options,
        timeZone: restaurantTimeZone,
      })
    : "Fecha por elegir";
}

const policyTime = z
  .string()
  .regex(/^\d{2}:\d{2}(?::00)?$/)
  .refine(
    (value) => restaurantInstant(`2026-01-01T${value.slice(0, 5)}`) !== null,
  )
  .transform((value) => value.slice(0, 5));
export const reservationPolicySchema = z
  .object({
    timeZone: z.literal(restaurantTimeZone),
    minimumNoticeHours: z.number().int().min(0).max(168),
    firstRequestTime: policyTime,
    lastRequestTime: policyTime,
    preorderRecommendedAfter: policyTime,
    preorderItemsSupported: z.boolean(),
    asOf: z.iso.datetime({ offset: true }),
  })
  .refine((value) => value.firstRequestTime <= value.lastRequestTime);
export type ReservationPolicy = z.infer<typeof reservationPolicySchema>;

export function reservationTimeError(
  value: string,
  now: number,
  policy: ReservationPolicy,
): string | null {
  const instant = restaurantInstant(value);
  if (!instant) return "Elige un día y una hora válidos.";
  if (Date.parse(instant) < now + policy.minimumNoticeHours * 3600000)
    return `Solicita con al menos ${policy.minimumNoticeHours} horas de anticipación.`;
  const time = value.slice(11);
  if (time < policy.firstRequestTime || time > policy.lastRequestTime)
    return `La política admite solicitudes entre ${policy.firstRequestTime} y ${policy.lastRequestTime}; no confirma disponibilidad.`;
  return null;
}

export function pickupTimeError(
  value: string,
  now: number,
  preparationSeconds: number,
): string | null {
  const instant = restaurantInstant(value);
  if (!instant) return "Elige un día y una hora válidos.";
  if (
    !Number.isFinite(preparationSeconds) ||
    preparationSeconds < 0 ||
    preparationSeconds > 86400
  )
    return "Revisa los platillos: el tiempo de preparación supera el límite de la solicitud.";
  if (Date.parse(instant) <= now + preparationSeconds * 1000)
    return "Elige una hora posterior al tiempo de preparación de tus platillos.";
  return null;
}

export function suggestPickup(
  now: number,
  preparationSeconds: number,
  asOf?: string,
) {
  const serverTime = Date.parse(asOf ?? "");
  const base = Number.isFinite(serverTime) ? Math.max(now, serverTime) : now;
  // Round up so minute precision cannot consume the safety buffer.
  const earliest =
    Math.ceil(
      (base + Math.max(900, preparationSeconds + 60) * 1000) /
        minuteMilliseconds,
    ) * minuteMilliseconds;
  return restaurantLocal(earliest);
}
