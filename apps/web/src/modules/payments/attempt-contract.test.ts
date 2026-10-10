import { expect, it } from "vitest";
import {
  isDurableAttempt,
  isPreparationContext,
  isResolutionReview,
  isResolutionQueue,
  isAttemptHistory,
  parsePreparation,
  parseReplacement,
  parseResolution,
  matchesPreparation,
} from "./attempt-contract";
const id = "10000000-0000-4000-8000-000000000001",
  other = "20000000-0000-4000-8000-000000000001",
  date = "2026-10-06T18:00:00Z";
const row = {
  attemptId: id,
  accountId: other,
  version: 1,
  status: "PREPARED",
  amount: 10,
  tipAmount: 0,
  currency: "GTQ",
  method: "TRANSFER",
  registerCode: "MAIN",
  availableActions: ["CAPTURE", "RETIRE"],
};
const input = { amount: 10, tipAmount: 0, currency: "GTQ", method: "TRANSFER" };
it("accepts explicit preparation without treating it as a confirmed payment", () => {
  expect(parsePreparation(input)).toEqual(input);
  expect(isDurableAttempt(row)).toBe(true);
  expect(isDurableAttempt({ ...row, status: "CONFIRMED" })).toBe(false);
});
it.each([0, -1, 1.005, 1e12, NaN, Infinity])(
  "rejects invalid money %s before submission",
  (amount) => expect(parsePreparation({ ...input, amount })).toBeNull(),
);
it("requires currency, explicit amount and rejects legacy identities/payload fields", () => {
  expect(
    parsePreparation({ method: "TRANSFER", currency: "GTQ", tipAmount: 0 }),
  ).toBeNull();
  expect(parsePreparation({ ...input, key: id })).toBeNull();
  expect(isDurableAttempt({ ...row, captureKey: id })).toBe(false);
});
it("confirms evidence separately from availability of a scalar balance", () => {
  const confirmed = {
    ...row,
    status: "CONFIRMED",
    executionRequestedAt: date,
    confirmation: {
      paymentId: other,
      amount: 10,
      tipAmount: 0,
      currency: "GTQ",
      method: "TRANSFER",
      capturedAt: date,
    },
    receiptAvailability: "RECONCILIATION_REQUIRED",
    availableActions: [],
  };
  expect(isDurableAttempt(confirmed)).toBe(true);
  expect(isDurableAttempt({ ...confirmed, balance: 0 })).toBe(false);
  expect(
    isDurableAttempt({
      ...confirmed,
      receiptAvailability: "AVAILABLE",
      balance: 0,
    }),
  ).toBe(true);
  expect(
    isDurableAttempt({
      ...confirmed,
      confirmation: { ...confirmed.confirmation, amount: 11 },
    }),
  ).toBe(false);
});
it.each(["PENDING", "REJECTED", "RETIRED", "CONFIRMED"])(
  "does not allow capture/replacement actions on inconsistent %s DTOs",
  (status) =>
    expect(
      isDurableAttempt({
        ...row,
        status,
        executionRequestedAt: date,
        availableActions: ["CAPTURE", "REPLACE"],
      }),
    ).toBe(false),
);
it("only allows a durable rejected replacement with explicit content", () => {
  expect(
    parseReplacement({
      expectedVersion: 3,
      reason: "Caja cerrada",
      payment: input,
    }),
  ).toBeTruthy();
  expect(
    parseReplacement({ expectedVersion: 3, reason: " ", payment: input }),
  ).toBeNull();
  expect(
    isDurableAttempt({
      ...row,
      status: "REJECTED",
      version: 3,
      executionRequestedAt: date,
      rejectionStatus: 409,
      rejectionMessage: "Caja cerrada",
      availableActions: ["REPLACE"],
    }),
  ).toBe(true);
});
it.each(["RECEIVED", "UNKNOWN", "NOT_RECEIVED "])(
  "never retires based on physical declaration %s",
  (physicalReceiptStatus) =>
    expect(
      parseResolution({
        expectedVersion: 2,
        reason: "Motivo",
        evidenceSummary: "Revisión",
        physicalReceiptStatus,
      }),
    ).toBeNull(),
);
it("preserves exceptional marker and metadata while requiring complete evidence", () => {
  const retired = {
    ...row,
    status: "RETIRED",
    version: 3,
    executionRequestedAt: date,
    availableActions: [],
    resolution: {
      actorId: other,
      resolvedAt: date,
      reason: "No recibió dinero",
      evidenceSummary: "Comprobación ficticia",
      expectedVersion: 2,
      physicalReceiptStatus: "NOT_RECEIVED",
    },
  };
  expect(isDurableAttempt(retired)).toBe(true);
  expect(
    isDurableAttempt({
      ...retired,
      resolution: { ...retired.resolution, expectedVersion: 1 },
    }),
  ).toBe(false);
  expect(
    parseResolution({
      expectedVersion: 2,
      reason: " ",
      evidenceSummary: "Revisión",
      physicalReceiptStatus: "NOT_RECEIVED",
    }),
  ).toBeNull();
});
it("rejects account/action-inconsistent context and ambiguous administrative review", () => {
  expect(
    isPreparationContext({
      accountId: other,
      canPrepare: false,
      blockedByAnotherOperator: false,
      ownActiveAttempt: row,
    }),
  ).toBe(true);
  expect(
    isPreparationContext({
      accountId: other,
      canPrepare: true,
      blockedByAnotherOperator: true,
    }),
  ).toBe(false);
  expect(
    isResolutionReview({
      ownerUserId: other,
      attempt: row,
      registeredCapture: true,
      claimState: "COMPLETED",
      availableActions: ["RETIRE_WITH_EVIDENCE"],
    }),
  ).toBe(false);
});
it("validates cursor namespaces and excludes financial details from the queue", () => {
  const q = {
    items: [
      {
        attemptId: id,
        accountId: other,
        ownerUserId: id,
        status: "PREPARED",
        version: 1,
        createdAt: date,
      },
    ],
    nextCursor: "resolution:" + id,
  };
  expect(isResolutionQueue(q)).toBe(true);
  expect(isResolutionQueue({ ...q, nextCursor: id })).toBe(false);
  expect(
    isResolutionQueue({ items: [{ ...q.items[0], reference: "private" }] }),
  ).toBe(false);
  expect(
    isAttemptHistory({ items: [row], blockedByAnotherOperator: false }),
  ).toBe(true);
});
it("compares the entire normalized preparation including newline boundaries", () => {
  expect(
    matchesPreparation(
      { ...row, reference: "A\nB", registerCode: "C" } as never,
      { ...input, method: "TRANSFER", reference: "A", registerCode: "B\nC" },
    ),
  ).toBe(false);
  expect(
    matchesPreparation(row as never, {
      ...input,
      method: "TRANSFER",
      registerCode: " main ",
    }),
  ).toBe(true);
});
