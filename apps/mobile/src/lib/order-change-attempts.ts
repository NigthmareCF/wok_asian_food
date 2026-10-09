export type OrderChangeAttempt = {
  ownerEmail: string;
  orderRequestId: string;
  orderItemId?: string | null;
  reason: string;
  key: string;
  savedAt: number;
  action?: "CANCEL" | "MODIFY_QUANTITY" | "MODIFY_MODIFIERS";
  quantity?: number;
  modifierIds?: string[];
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
        (attempt.orderItemId === undefined || attempt.orderItemId === null ||
          (typeof attempt.orderItemId === "string" && uuidV4Pattern.test(attempt.orderItemId))) &&
        typeof attempt.reason === "string" && attempt.reason.trim().length >= 3 && attempt.reason.length <= 500 &&
        typeof attempt.key === "string" && uuidV4Pattern.test(attempt.key) &&
        typeof attempt.savedAt === "number" && Number.isFinite(attempt.savedAt) &&
        (attempt.action === undefined || attempt.action === "CANCEL" || attempt.action === "MODIFY_QUANTITY" || attempt.action === "MODIFY_MODIFIERS") &&
        (attempt.quantity === undefined || (Number.isInteger(attempt.quantity) && attempt.quantity > 0)) &&
        (attempt.modifierIds === undefined || (Array.isArray(attempt.modifierIds) && attempt.modifierIds.length <= 30 &&
          attempt.modifierIds.every((id) => typeof id === "string" && uuidV4Pattern.test(id)))) &&
        attempt.savedAt <= now + 5 * 60 * 1000 && now - attempt.savedAt < maxAttemptsAgeMs;
    });
  } catch {
    return [];
  }
}

export function orderChangeAttemptsForOwner(attempts: OrderChangeAttempt[], ownerEmail: string): OrderChangeAttempt[] {
  const normalizedOwner = ownerEmail.trim().toLowerCase();
  if (!normalizedOwner) return [];
  return attempts.filter((attempt) => attempt.ownerEmail.trim().toLowerCase() === normalizedOwner);
}

export function resolveOrderChangeAttempt(
  attempts: OrderChangeAttempt[],
  ownerEmail: string,
  orderRequestId: string,
  reason: string,
  createKey: () => string,
  now = Date.now(),
  orderItemId: string | null = null,
  action: "CANCEL" | "MODIFY_QUANTITY" | "MODIFY_MODIFIERS" = "CANCEL",
  quantity?: number,
  modifierIds?: string[],
): OrderChangeAttempt[] {
  const owner = normalizeEmail(ownerEmail);
  const normalizedReason = reason.trim();
  const matchingIndex = attempts.findIndex((attempt) =>
    normalizeEmail(attempt.ownerEmail) === owner && attempt.orderRequestId === orderRequestId &&
      (attempt.orderItemId ?? null) === orderItemId &&
      (attempt.action ?? "CANCEL") === action && (attempt.quantity ?? null) === (quantity ?? null) &&
      JSON.stringify([...(attempt.modifierIds ?? [])].sort()) === JSON.stringify([...(modifierIds ?? [])].sort()),
  );
  const existing = matchingIndex >= 0 ? attempts[matchingIndex] : undefined;
  const next = existing?.reason === normalizedReason
    ? existing
    : { ownerEmail: ownerEmail.trim(), orderRequestId, orderItemId, reason: normalizedReason,
        key: createKey(), savedAt: now, action, quantity,
        ...(modifierIds ? { modifierIds: [...modifierIds].sort() } : {}) };
  if (matchingIndex < 0) return [...attempts, next];
  if (next === existing) return attempts;
  return attempts.map((attempt, index) => index === matchingIndex ? next : attempt);
}

export function removeOrderChangeAttempt(
  attempts: OrderChangeAttempt[],
  ownerEmail: string,
  orderRequestId: string,
  orderItemId: string | null = null,
  action: "CANCEL" | "MODIFY_QUANTITY" | "MODIFY_MODIFIERS" = "CANCEL",
  quantity?: number,
  modifierIds?: string[],
): OrderChangeAttempt[] {
  const owner = normalizeEmail(ownerEmail);
  return attempts.filter((attempt) =>
    normalizeEmail(attempt.ownerEmail) !== owner || attempt.orderRequestId !== orderRequestId ||
      (attempt.orderItemId ?? null) !== orderItemId ||
      (attempt.action ?? "CANCEL") !== action || (attempt.quantity ?? null) !== (quantity ?? null) ||
      JSON.stringify([...(attempt.modifierIds ?? [])].sort()) !== JSON.stringify([...(modifierIds ?? [])].sort()),
  );
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}
