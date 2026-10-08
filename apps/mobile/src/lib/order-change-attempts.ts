export type OrderChangeAttempt = {
  ownerEmail: string;
  orderRequestId: string;
  reason: string;
  key: string;
  savedAt: number;
};

const maxAttemptsAgeMs = 30 * 24 * 60 * 60 * 1000;
const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseOrderChangeAttempts(raw: string, now = Date.now()): OrderChangeAttempt[] {
  if (raw.length > 30000) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is OrderChangeAttempt => {
      if (!item || typeof item !== "object") return false;
      const attempt = item as Partial<OrderChangeAttempt>;
      return typeof attempt.ownerEmail === "string" && Boolean(attempt.ownerEmail.trim()) &&
        typeof attempt.orderRequestId === "string" && uuidV4Pattern.test(attempt.orderRequestId) &&
        typeof attempt.reason === "string" && attempt.reason.trim().length >= 3 && attempt.reason.length <= 500 &&
        typeof attempt.key === "string" && uuidV4Pattern.test(attempt.key) &&
        typeof attempt.savedAt === "number" && Number.isFinite(attempt.savedAt) &&
        attempt.savedAt <= now + 5 * 60 * 1000 && now - attempt.savedAt < maxAttemptsAgeMs;
    });
  } catch {
    return [];
  }
}

export function resolveOrderChangeAttempt(
  attempts: OrderChangeAttempt[],
  ownerEmail: string,
  orderRequestId: string,
  reason: string,
  createKey: () => string,
  now = Date.now(),
): OrderChangeAttempt[] {
  const owner = normalizeEmail(ownerEmail);
  const normalizedReason = reason.trim();
  const existing = attempts.find((attempt) =>
    normalizeEmail(attempt.ownerEmail) === owner && attempt.orderRequestId === orderRequestId,
  );
  const next = existing?.reason === normalizedReason
    ? existing
    : { ownerEmail: ownerEmail.trim(), orderRequestId, reason: normalizedReason, key: createKey(), savedAt: now };
  return [...attempts.filter((attempt) =>
    normalizeEmail(attempt.ownerEmail) !== owner || attempt.orderRequestId !== orderRequestId,
  ), next];
}

export function removeOrderChangeAttempt(
  attempts: OrderChangeAttempt[],
  ownerEmail: string,
  orderRequestId: string,
): OrderChangeAttempt[] {
  const owner = normalizeEmail(ownerEmail);
  return attempts.filter((attempt) =>
    normalizeEmail(attempt.ownerEmail) !== owner || attempt.orderRequestId !== orderRequestId,
  );
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}
