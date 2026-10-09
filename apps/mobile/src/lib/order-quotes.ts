export type OrderQuoteState = {
  status: "ACTIVE" | "CONSUMED" | "EXPIRED";
  expiresAt: string;
  usable: boolean;
};

export function isOrderQuoteExpired(quote: OrderQuoteState | null, now = Date.now()): boolean {
  if (!quote) return false;
  if (quote.status === "EXPIRED") return true;
  if (quote.status !== "ACTIVE") return false;
  const expiresAt = Date.parse(quote.expiresAt);
  return !Number.isFinite(expiresAt) || expiresAt <= now;
}

export function isOrderQuoteUsable(quote: OrderQuoteState | null, now = Date.now()): boolean {
  if (!quote || !quote.usable || quote.status !== "ACTIVE") return false;
  const expiresAt = Date.parse(quote.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export async function requestFreshOrderQuote<T extends OrderQuoteState>(
  request: (idempotencyKey: string) => Promise<T>,
  initialQuoteKey: string | undefined,
  requestPending: boolean,
  currentQuote: T | null,
  createKey: () => string,
  persistKey: (key: string, pending: boolean) => Promise<void>,
  now = Date.now,
): Promise<{ quote: T; idempotencyKey: string }> {
  let idempotencyKey = currentQuote && !isOrderQuoteUsable(currentQuote, now()) && !requestPending
    ? createKey()
    : initialQuoteKey ?? createKey();
  await persistKey(idempotencyKey, true);
  let quote = await request(idempotencyKey);

  if (isOrderQuoteExpired(quote, now()) || quote.status === "CONSUMED") {
    idempotencyKey = createKey();
    await persistKey(idempotencyKey, true);
    quote = await request(idempotencyKey);
  }

  return { quote, idempotencyKey };
}
