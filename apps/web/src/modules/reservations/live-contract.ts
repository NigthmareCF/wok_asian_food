import { isUuid } from "@/modules/checkout/pickup-contract";
import { record, instant } from "@/modules/client-workflows/validation";
const decisions = [
  "ACCEPT",
  "ACCEPT_WITH_CONDITIONS",
  "SUGGEST_OTHER_TIME",
  "REQUIRES_HUMAN_APPROVAL",
  "REJECT",
];
export type ReservationSubmission = {
  guests: number;
  requestedAt: string;
  preorder: false;
  notes: string;
};
export function parseReservation(v: unknown): ReservationSubmission | null {
  if (
    !record(v) ||
    !Number.isSafeInteger(v.guests) ||
    Number(v.guests) < 1 ||
    Number(v.guests) > 50 ||
    !instant(v.requestedAt) ||
    v.preorder !== false ||
    typeof v.notes !== "string" ||
    v.notes.length > 1000
  )
    return null;
  return {
    guests: Number(v.guests),
    requestedAt: v.requestedAt,
    preorder: false,
    notes: v.notes.trim(),
  };
}
export type ReservationResult = {
  requestId: string;
  reservationId?: string | null;
  submitted: boolean;
  decision: string;
  reasonCodes: string[];
  minimumOccupancyMinutes: number;
  maximumOccupancyMinutes: number;
  message: string;
};
export function isReservationResult(v: unknown): v is ReservationResult {
  return (
    record(v) &&
    isUuid(v.requestId) &&
    (v.reservationId == null || isUuid(v.reservationId)) &&
    typeof v.submitted === "boolean" &&
    (!v.submitted || isUuid(v.reservationId)) &&
    decisions.includes(String(v.decision)) &&
    Array.isArray(v.reasonCodes) &&
    v.reasonCodes.every((x) => typeof x === "string") &&
    Number.isSafeInteger(v.minimumOccupancyMinutes) &&
    Number.isSafeInteger(v.maximumOccupancyMinutes) &&
    typeof v.message === "string"
  );
}
export type ReservationHistoryItem = {
  requestId: string;
  reservationId?: string | null;
  requestedAt?: string | null;
  guests?: number | null;
  decision: string;
  reservationStatus?: string | null;
  message: string;
  submittedAt: string;
};
export function isReservationHistory(
  v: unknown,
): v is ReservationHistoryItem[] {
  return (
    Array.isArray(v) &&
    v.every(
      (x) =>
        record(x) &&
        isUuid(x.requestId) &&
        (x.reservationId == null || isUuid(x.reservationId)) &&
        (x.requestedAt == null || instant(x.requestedAt)) &&
        (x.guests == null || Number.isSafeInteger(x.guests)) &&
        decisions.includes(String(x.decision)) &&
        (x.reservationStatus == null ||
          typeof x.reservationStatus === "string") &&
        typeof x.message === "string" &&
        instant(x.submittedAt),
    )
  );
}
export const isReservationCancellation = (
  v: unknown,
): v is { reservationId: string; status: "CANCELLED" } =>
  record(v) && isUuid(v.reservationId) && v.status === "CANCELLED";
export const reservationLabels: Record<string, string> = {
  REQUESTED: "Pendiente de revisión",
  CONFIRMED: "Confirmada",
  CANCELLED: "Cancelada",
  REJECTED: "Rechazada",
  SEATED: "En mesa",
  COMPLETED: "Finalizada",
  NO_SHOW: "No se presentó",
};
