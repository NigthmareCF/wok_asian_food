import { isUuid } from "@/modules/checkout/pickup-contract";
import {
  money,
  object,
  paymentMethods,
  type PaymentMethod,
} from "./live-contract";
export type AttemptStatus =
  "PREPARED" | "PENDING" | "CONFIRMED" | "REJECTED" | "RETIRED";
export type AttemptAction =
  "CAPTURE" | "RETIRE" | "CONTINUE_SAME_ATTEMPT" | "REPLACE";
export type PreparationInput = {
  method: PaymentMethod;
  amount: number;
  tipAmount: number;
  currency: string;
  reference?: string;
  registerCode?: string;
  expectedPreviousAttemptId?: string | null;
};
export type ResolutionInput = {
  expectedVersion: number;
  reason: string;
  evidenceSummary: string;
  evidenceReference?: string;
  physicalReceiptStatus: "NOT_RECEIVED";
};
export type ResolutionEvidence = {
  actorId: string;
  resolvedAt: string;
  reason: string;
  evidenceSummary: string;
  evidenceReference?: string | null;
  expectedVersion: number;
  physicalReceiptStatus: "NOT_RECEIVED";
};
export type Confirmation = {
  paymentId: string;
  amount: number;
  tipAmount: number;
  currency: string;
  method: PaymentMethod;
  capturedAt: string;
};
export type DurableAttempt = {
  attemptId: string;
  accountId: string;
  version: number;
  status: AttemptStatus;
  previousAttemptId?: string | null;
  amount: number;
  tipAmount: number;
  currency: string;
  method: PaymentMethod;
  reference?: string | null;
  registerCode?: string | null;
  executionRequestedAt?: string | null;
  confirmation?: Confirmation | null;
  receiptAvailability?: "AVAILABLE" | "RECONCILIATION_REQUIRED" | null;
  balance?: number | null;
  rejectionStatus?: number | null;
  rejectionMessage?: string | null;
  availableActions: AttemptAction[];
  resolution?: ResolutionEvidence | null;
};
export type AttemptHistory = {
  items: DurableAttempt[];
  nextCursor?: string | null;
  blockedByAnotherOperator: boolean;
};
export type PreparationContext = {
  accountId: string;
  canPrepare: boolean;
  expectedPreviousAttemptId?: string | null;
  ownActiveAttempt?: DurableAttempt | null;
  blockedByAnotherOperator: boolean;
};
export type ResolutionReview = {
  ownerUserId: string;
  attempt: DurableAttempt;
  registeredCapture: boolean;
  claimState: string;
  availableActions: "RETIRE_WITH_EVIDENCE"[];
};
export type ResolutionQueueItem = {
  attemptId: string;
  accountId: string;
  ownerUserId: string;
  status: "PREPARED" | "PENDING";
  version: number;
  createdAt: string;
};
export type ResolutionQueue = {
  items: ResolutionQueueItem[];
  nextCursor?: string | null;
};
const positive = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const text = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;
const date = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 40 && Number.isFinite(Date.parse(v));
const currency = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Z]{3}$/.test(v);
const optionalUuid = (v: unknown) => v == null || isUuid(v);
const exact = (v: Record<string, unknown>, fields: string[]) =>
  Object.keys(v).every((k) => fields.includes(k));
const method = (v: unknown): v is PaymentMethod =>
  paymentMethods.some((m) => m.value === v);
export function parsePreparation(v: unknown): PreparationInput | null {
  if (
    !object(v) ||
    !exact(v, [
      "method",
      "amount",
      "tipAmount",
      "currency",
      "reference",
      "registerCode",
      "expectedPreviousAttemptId",
    ]) ||
    !method(v.method) ||
    !money(v.amount) ||
    v.amount <= 0 ||
    !money(v.tipAmount) ||
    v.tipAmount < 0 ||
    !currency(v.currency) ||
    (v.reference !== undefined && !text(v.reference, 120)) ||
    (v.registerCode !== undefined && !text(v.registerCode, 32)) ||
    !optionalUuid(v.expectedPreviousAttemptId)
  )
    return null;
  return v as PreparationInput;
}
export function parseVersion(v: unknown): { expectedVersion: number } | null {
  return object(v) &&
    exact(v, ["expectedVersion"]) &&
    positive(v.expectedVersion)
    ? { expectedVersion: v.expectedVersion }
    : null;
}
export function parseRetirement(
  v: unknown,
): { expectedVersion: number; reason: string } | null {
  return object(v) &&
    exact(v, ["expectedVersion", "reason"]) &&
    positive(v.expectedVersion) &&
    text(v.reason, 500)
    ? { expectedVersion: v.expectedVersion, reason: v.reason }
    : null;
}
export function parseReplacement(v: unknown): {
  expectedVersion: number;
  reason: string;
  payment: PreparationInput;
} | null {
  if (
    !object(v) ||
    !exact(v, ["expectedVersion", "reason", "payment"]) ||
    !positive(v.expectedVersion) ||
    !text(v.reason, 500)
  )
    return null;
  const payment = parsePreparation(v.payment);
  return payment
    ? { expectedVersion: v.expectedVersion, reason: v.reason, payment }
    : null;
}
export function parseResolution(v: unknown): ResolutionInput | null {
  return object(v) &&
    exact(v, [
      "expectedVersion",
      "reason",
      "evidenceSummary",
      "evidenceReference",
      "physicalReceiptStatus",
    ]) &&
    positive(v.expectedVersion) &&
    text(v.reason, 500) &&
    text(v.evidenceSummary, 1000) &&
    (v.evidenceReference === undefined || text(v.evidenceReference, 200)) &&
    v.physicalReceiptStatus === "NOT_RECEIVED"
    ? (v as ResolutionInput)
    : null;
}
function isEvidence(v: unknown): v is ResolutionEvidence {
  return (
    object(v) &&
    exact(v, [
      "actorId",
      "resolvedAt",
      "reason",
      "evidenceSummary",
      "evidenceReference",
      "expectedVersion",
      "physicalReceiptStatus",
    ]) &&
    isUuid(v.actorId) &&
    date(v.resolvedAt) &&
    positive(v.expectedVersion) &&
    text(v.reason, 500) &&
    text(v.evidenceSummary, 1000) &&
    (v.evidenceReference == null || text(v.evidenceReference, 200)) &&
    v.physicalReceiptStatus === "NOT_RECEIVED"
  );
}
export function isDurableAttempt(v: unknown): v is DurableAttempt {
  if (
    !object(v) ||
    !exact(v, [
      "attemptId",
      "accountId",
      "version",
      "status",
      "previousAttemptId",
      "amount",
      "tipAmount",
      "currency",
      "method",
      "reference",
      "registerCode",
      "executionRequestedAt",
      "confirmation",
      "receiptAvailability",
      "balance",
      "rejectionStatus",
      "rejectionMessage",
      "availableActions",
      "resolution",
    ]) ||
    !isUuid(v.attemptId) ||
    !isUuid(v.accountId) ||
    !positive(v.version) ||
    !optionalUuid(v.previousAttemptId) ||
    !money(v.amount) ||
    v.amount <= 0 ||
    !money(v.tipAmount) ||
    v.tipAmount < 0 ||
    !currency(v.currency) ||
    !method(v.method) ||
    (v.reference != null && !text(v.reference, 120)) ||
    (v.registerCode != null && !text(v.registerCode, 32)) ||
    !Array.isArray(v.availableActions)
  )
    return false;
  const legal: Record<string, string[]> = {
    PREPARED: ["CAPTURE", "RETIRE"],
    PENDING: ["CONTINUE_SAME_ATTEMPT"],
    CONFIRMED: [],
    REJECTED: ["REPLACE"],
    RETIRED: [],
  };
  if (
    typeof v.status !== "string" ||
    !Object.hasOwn(legal, v.status) ||
    !v.availableActions.every((a) => legal[v.status as string].includes(a)) ||
    new Set(v.availableActions).size !== v.availableActions.length
  )
    return false;
  if (
    v.status === "PREPARED"
      ? v.executionRequestedAt != null
      : v.status !== "RETIRED" && !date(v.executionRequestedAt)
  )
    return false;
  if (
    v.status === "RETIRED" &&
    v.executionRequestedAt != null &&
    !date(v.executionRequestedAt)
  )
    return false;
  if (v.status === "CONFIRMED") {
    const c = v.confirmation;
    if (
      !object(c) ||
      !exact(c, [
        "paymentId",
        "amount",
        "tipAmount",
        "currency",
        "method",
        "capturedAt",
      ]) ||
      !isUuid(c.paymentId) ||
      !date(c.capturedAt) ||
      c.amount !== v.amount ||
      c.tipAmount !== v.tipAmount ||
      c.currency !== v.currency ||
      c.method !== v.method ||
      !["AVAILABLE", "RECONCILIATION_REQUIRED"].includes(
        String(v.receiptAvailability),
      )
    )
      return false;
    if (
      v.receiptAvailability === "AVAILABLE"
        ? !money(v.balance) || v.balance < 0
        : v.balance != null
    )
      return false;
  } else if (
    v.confirmation != null ||
    v.receiptAvailability != null ||
    v.balance != null
  )
    return false;
  if (
    v.status === "REJECTED"
      ? !positive(v.rejectionStatus) ||
        v.rejectionStatus < 400 ||
        v.rejectionStatus >= 500 ||
        !text(v.rejectionMessage, 2000)
      : v.rejectionStatus != null || v.rejectionMessage != null
  )
    return false;
  if (
    v.resolution != null &&
    (v.status !== "RETIRED" ||
      !isEvidence(v.resolution) ||
      v.resolution.expectedVersion !== (v.version as number) - 1)
  )
    return false;
  return true;
}
export function isAttemptHistory(v: unknown): v is AttemptHistory {
  return (
    object(v) &&
    exact(v, ["items", "nextCursor", "blockedByAnotherOperator"]) &&
    Array.isArray(v.items) &&
    v.items.length <= 50 &&
    v.items.every(isDurableAttempt) &&
    optionalUuid(v.nextCursor) &&
    typeof v.blockedByAnotherOperator === "boolean"
  );
}
export function isPreparationContext(v: unknown): v is PreparationContext {
  return (
    object(v) &&
    exact(v, [
      "accountId",
      "canPrepare",
      "expectedPreviousAttemptId",
      "ownActiveAttempt",
      "blockedByAnotherOperator",
    ]) &&
    isUuid(v.accountId) &&
    typeof v.canPrepare === "boolean" &&
    optionalUuid(v.expectedPreviousAttemptId) &&
    typeof v.blockedByAnotherOperator === "boolean" &&
    (v.ownActiveAttempt == null ||
      (isDurableAttempt(v.ownActiveAttempt) &&
        v.ownActiveAttempt.accountId === v.accountId &&
        ["PREPARED", "PENDING"].includes(v.ownActiveAttempt.status))) &&
    !(
      v.canPrepare &&
      (v.ownActiveAttempt != null || v.blockedByAnotherOperator)
    ) &&
    !(v.ownActiveAttempt != null && v.blockedByAnotherOperator)
  );
}
export function isResolutionReview(v: unknown): v is ResolutionReview {
  return (
    object(v) &&
    exact(v, [
      "ownerUserId",
      "attempt",
      "registeredCapture",
      "claimState",
      "availableActions",
    ]) &&
    isUuid(v.ownerUserId) &&
    isDurableAttempt(v.attempt) &&
    typeof v.registeredCapture === "boolean" &&
    typeof v.claimState === "string" &&
    Array.isArray(v.availableActions) &&
    v.availableActions.length <= 1 &&
    v.availableActions.every((a) => a === "RETIRE_WITH_EVIDENCE") &&
    (!v.availableActions.length ||
      (!v.registeredCapture &&
        v.claimState === "ABSENT" &&
        ["PREPARED", "PENDING"].includes(v.attempt.status))) &&
    (v.attempt.status !== "CONFIRMED" || v.registeredCapture)
  );
}
export function isResolutionQueue(v: unknown): v is ResolutionQueue {
  return (
    object(v) &&
    exact(v, ["items", "nextCursor"]) &&
    Array.isArray(v.items) &&
    v.items.length <= 50 &&
    v.items.every(
      (i) =>
        object(i) &&
        exact(i, [
          "attemptId",
          "accountId",
          "ownerUserId",
          "status",
          "version",
          "createdAt",
        ]) &&
        isUuid(i.attemptId) &&
        isUuid(i.accountId) &&
        isUuid(i.ownerUserId) &&
        ["PREPARED", "PENDING"].includes(String(i.status)) &&
        positive(i.version) &&
        date(i.createdAt),
    ) &&
    (v.nextCursor == null ||
      (typeof v.nextCursor === "string" &&
        v.nextCursor.startsWith("resolution:") &&
        isUuid(v.nextCursor.slice(11))))
  );
}

// Se compara con la normalización existente del API, sin cambiar referencias/códigos enviados.
export function matchesPreparation(
  row: DurableAttempt,
  input: PreparationInput,
) {
  return (
    row.method === input.method &&
    row.amount === input.amount &&
    row.tipAmount === input.tipAmount &&
    row.currency === input.currency &&
    (row.reference ?? null) === (input.reference?.trim() || null) &&
    row.registerCode === (input.registerCode?.trim().toUpperCase() || "MAIN") &&
    (row.previousAttemptId ?? null) ===
      (input.expectedPreviousAttemptId?.toLowerCase() ?? null)
  );
}
