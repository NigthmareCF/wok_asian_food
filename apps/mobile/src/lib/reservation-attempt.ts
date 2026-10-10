import { z } from "zod";
import { ApiError } from "./api-client";
import type { ReservationResult } from "./api";

export type ReservationAttempt = Readonly<{
  owner: string;
  sessionVersion: number;
  body: string;
  key: string;
}>;

const resultSchema = z
  .object({
    requestId: z.uuid(),
    reservationId: z.uuid().nullable(),
    submitted: z.boolean(),
    decision: z.enum([
      "ACCEPT",
      "ACCEPT_WITH_CONDITIONS",
      "SUGGEST_OTHER_TIME",
      "REQUIRES_HUMAN_APPROVAL",
      "REJECT",
    ]),
    reasonCodes: z.array(z.string()),
    minimumOccupancyMinutes: z.number().int().positive(),
    maximumOccupancyMinutes: z.number().int().positive(),
    message: z.string(),
  })
  .refine(
    (value) =>
      value.minimumOccupancyMinutes <= value.maximumOccupancyMinutes &&
      value.submitted === (value.reservationId !== null) &&
      value.submitted ===
        !["REJECT", "SUGGEST_OTHER_TIME"].includes(value.decision),
  );

export function reservationAcknowledgement(
  result: unknown,
  attempt: ReservationAttempt,
): ReservationResult | null {
  const parsed = resultSchema.safeParse(result);
  return parsed.success && parsed.data.requestId === attempt.key
    ? parsed.data
    : null;
}

export function isDefinitiveReservationRejection(error: unknown) {
  // Known validation, authorization, body and rate-limit failures. A conflict
  // can refer to an existing request; timeout and unknown statuses prove nothing.
  return (
    error instanceof ApiError &&
    [400, 401, 403, 413, 415, 422, 429].includes(error.status ?? 0)
  );
}
