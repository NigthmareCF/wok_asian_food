export const restaurantTimeZone = "America/Guatemala";

const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function parseRestaurantLocalDateTime(value: string): Date | null {
  const match = localDateTimePattern.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  if (year < 1900 || hour > 23 || minute > 59) return null;

  const localAsUtc = new Date(0);
  localAsUtc.setUTCFullYear(year, month - 1, day);
  localAsUtc.setUTCHours(hour, minute, 0, 0);
  if (localAsUtc.getUTCFullYear() !== year || localAsUtc.getUTCMonth() !== month - 1 || localAsUtc.getUTCDate() !== day) return null;

  const target = localAsUtc.getTime();
  let candidate = target;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: restaurantTimeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map(({ type, value: part }) => [type, part]));
    const displayedAsUtc = new Date(0);
    displayedAsUtc.setUTCFullYear(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
    displayedAsUtc.setUTCHours(Number(parts.hour), Number(parts.minute), 0, 0);
    const correction = target - displayedAsUtc.getTime();
    candidate += correction;
    if (correction === 0) return new Date(candidate);
  }
  return null;
}

export function formatRestaurantDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Horario no disponible" : date.toLocaleString("es-GT", {
    timeZone: restaurantTimeZone, dateStyle: "medium", timeStyle: "short", hourCycle: "h23",
  });
}
