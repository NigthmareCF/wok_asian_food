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
  const minimum = inputValue(new Date(roundedMs));
  return {min:minimum,max:"",defaultValue:minimum};
}

export function isWithinPickupWindow(value: string, window: PickupWindow) {
  const instant = pickupInputToInstant(value);
  const minimum = pickupInputToInstant(window.min);
  const maximum = pickupInputToInstant(window.max);
  return Boolean(
    instant && minimum && instant >= minimum && (!maximum || instant <= maximum),
  );
}
