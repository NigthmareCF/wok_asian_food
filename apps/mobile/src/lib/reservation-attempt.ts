export type PendingReservationAttempt = {
  ownerEmail: string;
  body: string;
  key: string;
  savedAt: number;
};

const maxAttemptAgeMs = 30 * 24 * 60 * 60 * 1000;
const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parsePendingReservationAttempt(raw: string, now = Date.now()): PendingReservationAttempt | null {
  if (raw.length > 30000) return null;
  try {
    const value = JSON.parse(raw) as Partial<PendingReservationAttempt>;
    if (typeof value.ownerEmail !== "string" || !value.ownerEmail.trim() ||
        typeof value.body !== "string" || !value.body || value.body.length > 28000 ||
        typeof value.key !== "string" || !uuidV4Pattern.test(value.key) ||
        typeof value.savedAt !== "number" || !Number.isFinite(value.savedAt) ||
        value.savedAt > now + 5 * 60 * 1000 || now - value.savedAt >= maxAttemptAgeMs) return null;
    return value as PendingReservationAttempt;
  } catch {
    return null;
  }
}

export function resolvePendingReservationAttempt(
  current: PendingReservationAttempt | null,
  ownerEmail: string,
  body: string,
  createKey: () => string,
  now = Date.now(),
): PendingReservationAttempt {
  if (current?.ownerEmail === ownerEmail && current.body === body) return current;
  return { ownerEmail, body, key: createKey(), savedAt: now };
}
