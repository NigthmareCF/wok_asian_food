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

export type OperationalPendingReservation = {
  id: string;
  guests: number;
  reservationAt: string;
  estimatedEndAt: string;
  notes: string | null;
  rowVersion: number;
  customerName: string;
  email: string | null;
};

export function isOperationalPendingReservations(
  v: unknown,
): v is OperationalPendingReservation[] {
  return (
    Array.isArray(v) &&
    v.every(
      (item) =>
        record(item) &&
        isUuid(item.id) &&
        Number.isSafeInteger(item.guests) &&
        Number(item.guests) > 0 &&
        instant(item.reservationAt) &&
        instant(item.estimatedEndAt) &&
        (item.notes === null || typeof item.notes === "string") &&
        Number.isSafeInteger(item.rowVersion) &&
        Number(item.rowVersion) > 0 &&
        typeof item.customerName === "string" &&
        (item.email === null || typeof item.email === "string"),
    )
  );
}

export type OperationalReservationDecision = {
  decision: "CONFIRM" | "REJECT";
  reason: string;
  expectedVersion: number;
};

export function parseOperationalReservationDecision(
  v: unknown,
): OperationalReservationDecision | null {
  if (
    !record(v) ||
    (v.decision !== "CONFIRM" && v.decision !== "REJECT") ||
    typeof v.reason !== "string" ||
    v.reason.trim().length < 3 ||
    v.reason.trim().length > 500 ||
    !Number.isSafeInteger(v.expectedVersion) ||
    Number(v.expectedVersion) <= 0
  )
    return null;
  return {
    decision: v.decision,
    reason: v.reason.trim(),
    expectedVersion: Number(v.expectedVersion),
  };
}

export type OperationalReservationDecisionResult = {
  reservationId: string;
  decision: "CONFIRM" | "REJECT";
  status: "CONFIRMED" | "CANCELLED";
  rowVersion: number;
  reason: string;
};

export function isOperationalReservationDecisionResult(
  v: unknown,
): v is OperationalReservationDecisionResult {
  return (
    record(v) &&
    isUuid(v.reservationId) &&
    (v.decision === "CONFIRM" || v.decision === "REJECT") &&
    (v.status === "CONFIRMED" || v.status === "CANCELLED") &&
    Number.isSafeInteger(v.rowVersion) &&
    Number(v.rowVersion) > 0 &&
    typeof v.reason === "string"
  );
}
export const reservationLabels: Record<string, string> = {
  REQUESTED: "Pendiente de revisión",
  CONFIRMED: "Confirmada",
  CANCELLED: "Cancelada",
  REJECTED: "Rechazada",
  SEATED: "En mesa",
  COMPLETED: "Finalizada",
  NO_SHOW: "No se presentó",
};
