const SERVICE_TIME_ZONE = "America/Guatemala";
const SERVICE_OFFSET = "-06:00";
const OPEN_MINUTE = 14 * 60;
const CLOSE_MINUTE = 22 * 60;
const MAX_ADVANCE_MS = 3 * 60 * 60 * 1000;
const REVIEW_BUFFER_MS = 10 * 60 * 1000;

type Parts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
};

function parts(date: Date): Parts {
  const values = new Intl.DateTimeFormat("en-CA", {
    timeZone: SERVICE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    values.find((entry) => entry.type === type)?.value ?? "";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    weekday: value("weekday"),
  };
}

function inputValue(date: Date) {
  const local = parts(date);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${local.year}-${pad(local.month)}-${pad(local.day)}T${pad(local.hour)}:${pad(local.minute)}`;
}
export { inputValue as serviceInputValue };

export function pickupInputToInstant(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00${SERVICE_OFFSET}`);
  return Number.isFinite(date.getTime()) ? date : null;
}

export type PickupWindow = {
  min: string;
  max: string;
  defaultValue: string;
};

export function nextPickupWindow(
  preparationSeconds: number,
  now = new Date(),
): PickupWindow | null {
  const earliestMs =
    now.getTime() + Math.max(preparationSeconds, 0) * 1000 + REVIEW_BUFFER_MS;
  const roundedMs = Math.ceil(earliestMs / (5 * 60 * 1000)) * 5 * 60 * 1000;
  const horizonMs = now.getTime() + MAX_ADVANCE_MS;
  const localNow = parts(now);
  if (localNow.weekday === "Mon") return null;

  const pad = (value: number) => String(value).padStart(2, "0");
  const day = `${localNow.year}-${pad(localNow.month)}-${pad(localNow.day)}`;
  const openingMs = new Date(`${day}T14:00:00${SERVICE_OFFSET}`).getTime();
  const closingMs = new Date(`${day}T22:00:00${SERVICE_OFFSET}`).getTime();
  const minimumMs = Math.max(roundedMs, openingMs);
  const maximumMs = Math.min(horizonMs, closingMs - 60_000);
  if (minimumMs > maximumMs) return null;

  const minimum = new Date(minimumMs);
  const maximum = new Date(maximumMs);
  return {
    min: inputValue(minimum),
    max: inputValue(maximum),
    defaultValue: inputValue(minimum),
  };
}

export function isWithinPickupWindow(value: string, window: PickupWindow) {
  const instant = pickupInputToInstant(value);
  const minimum = pickupInputToInstant(window.min);
  const maximum = pickupInputToInstant(window.max);
  return Boolean(
    instant && minimum && maximum && instant >= minimum && instant <= maximum,
  );
}
