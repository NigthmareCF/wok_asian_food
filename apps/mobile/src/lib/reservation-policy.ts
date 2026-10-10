import { z } from "zod";

export const reservationPolicySchema = z.object({
  timeZone: z.literal("America/Guatemala"),
  minimumNoticeMinutes: z.number().int().nonnegative(),
  additionalPairMinutes: z.number().int().nonnegative(),
  firstRequestTime: z.string().regex(/^\d{2}:\d{2}(?::00)?$/),
  lastRequestTime: z.string().regex(/^\d{2}:\d{2}(?::00)?$/),
  asOf: z.iso.datetime({ offset: true }),
});
export type ReservationPolicy = z.infer<typeof reservationPolicySchema>;

export function reservationInstant(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const instant = Date.parse(`${value}:00-06:00`);
  if (!Number.isFinite(instant)) return null;
  const local = new Date(instant - 6 * 3600000).toISOString().slice(0, 16);
  return local === value ? new Date(instant).toISOString() : null;
}

export function reservationPolicyError(value: string, guests: number, now: number, policy: ReservationPolicy) {
  const instant = reservationInstant(value);
  if (!instant) return "Indica una fecha y hora válidas en horario de Guatemala.";
  const serverNow = Date.parse(policy.asOf);
  const current = Math.max(now, serverNow);
  const sameDay = value.slice(0, 10) === new Date(current - 6 * 3600000).toISOString().slice(0, 10);
  const notice = policy.minimumNoticeMinutes + (sameDay ? Math.ceil(Math.max(0, guests - 4) / 2) * policy.additionalPairMinutes : 0);
  if (Date.parse(instant) < current + notice * 60000) return `Este grupo requiere al menos ${notice} minutos de anticipación.`;
  const time = value.slice(11);
  if (time < policy.firstRequestTime.slice(0, 5) || time > policy.lastRequestTime.slice(0, 5))
    return "El horario está fuera de la ventana de reservas configurada.";
  return null;
}
