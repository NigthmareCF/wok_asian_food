import { pickupInputToInstant } from "@/modules/checkout/pickup-window";

function localInput(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guatemala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (key: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === key)!.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

// OperationalCapacityService: aviso de tres horas y ventana 14:00–21:15, Guatemala.
export function nextReservationWindow(now = new Date()) {
  const day = localInput(now).slice(0, 10);
  const earliest =
    Math.ceil((now.getTime() + 3 * 3600000 + 60000) / 60000) * 60000;
  const opening = pickupInputToInstant(`${day}T14:00`)!.getTime();
  const closing = pickupInputToInstant(`${day}T21:15`)!.getTime();
  const first =
    earliest <= closing ? Math.max(earliest, opening) : opening + 86400000;
  return {
    min: localInput(new Date(first)),
    defaultValue: localInput(new Date(first)),
  };
}

export function reservationInputToInstant(value: string, now = new Date()) {
  const date = pickupInputToInstant(value);
  if (
    !date ||
    localInput(date) !== value ||
    date.getTime() < now.getTime() + 3 * 3600000
  )
    return null;
  const time = value.slice(11);
  return time >= "14:00" && time <= "21:15" ? date : null;
}
