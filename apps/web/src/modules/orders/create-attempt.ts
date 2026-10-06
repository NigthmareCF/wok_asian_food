import type { CreateOrder } from "./live-contract";
export type CreateAttempt = { fingerprint: string; key: string };

// El backend omite accountId y notas de líneas en su fingerprint. La UI incluye todo el DTO.
export function orderAttempt(
  payload: CreateOrder,
  previous: CreateAttempt | null,
): CreateAttempt {
  const fingerprint = JSON.stringify(payload);
  return previous?.fingerprint === fingerprint
    ? previous
    : { fingerprint, key: crypto.randomUUID() };
}
