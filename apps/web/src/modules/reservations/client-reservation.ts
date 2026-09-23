import { clientReservationFixture } from "@/data/fixtures/client-reservations";
import {
  localDate,
  type ReservationDraft,
} from "@/modules/clients/client-session";

export type ReservationErrors = Partial<
  Record<"date" | "time" | "people" | "preorder" | "serviceTime", string>
>;
function timeMinutes(time: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return NaN;
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}
export function isRejectedReservation(time: string) {
  return timeMinutes(time) > 21 * 60 + 30;
}
export function isLateReservation(time: string) {
  return (
    timeMinutes(time) >
      timeMinutes(clientReservationFixture.lastNormalEntryTime) &&
    !isRejectedReservation(time)
  );
}
export function validateReservation(
  draft: ReservationDraft,
  now = new Date(),
): ReservationErrors {
  const errors: ReservationErrors = {};
  const date = new Date(`${draft.date}T12:00:00`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(draft.date) ||
    Number.isNaN(date.getTime()) ||
    localDate(date) !== draft.date
  )
    errors.date = "Selecciona una fecha válida.";
  else if (draft.date < localDate(now))
    errors.date = "Selecciona hoy o una fecha posterior.";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time))
    errors.time = "Selecciona una hora válida.";
  if (isRejectedReservation(draft.time))
    errors.time =
      "No se aceptan reservas después de las 21:30. Elige otra hora.";
  if (!Number.isSafeInteger(draft.people) || draft.people < 1)
    errors.people = "Selecciona al menos una persona.";
  if (draft.includesPreorder === null)
    errors.preorder = "Indica si deseas incluir preorden.";
  if (isLateReservation(draft.time) && draft.includesPreorder !== true)
    errors.preorder = "Después de las 21:15 se requiere preorden completa.";
  if (draft.serviceTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.serviceTime))
    errors.serviceTime = "Selecciona una hora objetivo válida.";
  return errors;
}
