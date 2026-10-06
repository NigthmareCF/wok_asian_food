import { record } from "@/modules/client-workflows/validation";

export const positive = (v: unknown): v is number =>
  Number.isSafeInteger(v) && Number(v) > 0;
export const count = (v: unknown): v is number =>
  Number.isSafeInteger(v) && Number(v) >= 0;
export const money = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;
export const text = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;
export const optional = (v: unknown, validate: (v: unknown) => boolean) =>
  v == null || validate(v);
export const note = (v: unknown, max: number) =>
  v == null || (typeof v === "string" && v.length <= max);

export function parseStatus<S extends string>(
  value: unknown,
  statuses: readonly S[],
): { status: S; expectedVersion: number; reason?: string } | null {
  if (
    !record(value) ||
    !statuses.includes(value.status as S) ||
    !positive(value.expectedVersion) ||
    !note(value.reason, 300)
  )
    return null;
  return {
    status: value.status as S,
    expectedVersion: value.expectedVersion,
    ...(typeof value.reason === "string"
      ? { reason: value.reason.trim() }
      : {}),
  };
}
