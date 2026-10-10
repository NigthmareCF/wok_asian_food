const SERVICE_TIME_ZONE = "America/Guatemala";
const SERVICE_OFFSET = "-06:00";
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
  defaultValue: string;
};

export function nextPickupWindow(
  preparationSeconds: number,
  now = new Date(),
): PickupWindow | null {
  const earliestMs =
    now.getTime() + Math.max(preparationSeconds, 0) * 1000 + REVIEW_BUFFER_MS;
  const roundedMs = Math.ceil(earliestMs / (5 * 60 * 1000)) * 5 * 60 * 1000;
  const localNow = parts(now);
  const pad = (value: number) => String(value).padStart(2, "0");
  const localDate = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day));
  let minimum: Date | null = null;
  for (let offset = 0; offset < 8; offset++) {
    const day = new Date(localDate);
    day.setUTCDate(day.getUTCDate() + offset);
    const date = `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`;
    const weekday = new Date(`${date}T12:00:00${SERVICE_OFFSET}`).toLocaleDateString("en-US", {
      timeZone: SERVICE_TIME_ZONE,
      weekday: "short",
    });
    if (weekday === "Mon") continue;
    const openingMs = new Date(`${date}T14:00:00${SERVICE_OFFSET}`).getTime();
    const closingMs = new Date(`${date}T22:00:00${SERVICE_OFFSET}`).getTime();
    const candidate = Math.max(roundedMs, openingMs);
    if (candidate < closingMs) {
      minimum = new Date(candidate);
      break;
    }
  }
  if (!minimum) return null;
  return {
    min: inputValue(minimum),
    defaultValue: inputValue(minimum),
  };
}

export function isWithinPickupWindow(value: string, window: PickupWindow) {
  const instant = pickupInputToInstant(value);
  const minimum = pickupInputToInstant(window.min);
  if (!instant || !minimum || instant < minimum) return false;
  const local = parts(instant);
  return Boolean(
    local.weekday !== "Mon" &&
    local.hour >= 14 &&
      local.hour < 22,
  );
}
