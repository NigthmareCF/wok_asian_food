const MINIMUM_NOTICE_MS = 3 * 60 * 60 * 1000;

export type ReservationTimeCheck =
  { valid: true } | { valid: false; reason: "INVALID_TIME" | "TOO_SOON" };

// UI guidance only. The API must evaluate restaurant time and capacity again.
export function checkReservationNotice(
  date: string,
  time: string,
  now: Date = new Date(),
): ReservationTimeCheck {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return { valid: false, reason: "INVALID_TIME" };
  }

  const requested = new Date(`${date}T${time}:00`);
  if (
    Number.isNaN(requested.getTime()) ||
    requested.getFullYear() !== Number(date.slice(0, 4)) ||
    requested.getMonth() + 1 !== Number(date.slice(5, 7)) ||
    requested.getDate() !== Number(date.slice(8, 10)) ||
    requested.getHours() !== Number(time.slice(0, 2)) ||
    requested.getMinutes() !== Number(time.slice(3, 5))
  ) {
    return { valid: false, reason: "INVALID_TIME" };
  }

  return requested.getTime() - now.getTime() >= MINIMUM_NOTICE_MS
    ? { valid: true }
    : { valid: false, reason: "TOO_SOON" };
}
