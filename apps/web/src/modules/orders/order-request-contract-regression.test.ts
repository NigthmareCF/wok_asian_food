import { expect, it } from "vitest";
import {
  isOrderRequestDecisionResult,
  parseOrderRequestDecision,
} from "./order-request-contract";

const requestId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";

it("accepts acceptance without reason and excludes unrelated fields", () => {
  expect(
    parseOrderRequestDecision({
      action: "ACCEPT",
      expectedVersion: 1,
      actor: "client",
    }),
  ).toEqual({ action: "ACCEPT" });
  expect(parseOrderRequestDecision({ action: "ACCEPT", reason: null })).toEqual(
    { action: "ACCEPT" },
  );
});
it("accepts a rejection reason and normalizes whitespace", () => {
  expect(
    parseOrderRequestDecision({
      action: "REJECT",
      reason: " Motivo de prueba ",
    }),
  ).toEqual({ action: "REJECT", reason: "Motivo de prueba" });
});
it.each([undefined, null, "", "   ", "\n\t", 42])(
  "rejects missing or blank rejection reason %j",
  (reason) => {
    expect(parseOrderRequestDecision({ action: "REJECT", reason })).toBeNull();
  },
);
it.each(["ACCEPT", "REJECT"])(
  "enforces the 500 character reason limit for %s",
  (action) => {
    expect(
      parseOrderRequestDecision({ action, reason: "x".repeat(500) }),
    ).not.toBeNull();
    expect(
      parseOrderRequestDecision({ action, reason: "x".repeat(501) }),
    ).toBeNull();
  },
);
it.each([
  null,
  [],
  {},
  { action: "CONFIRM" },
  { action: "accept" },
  { action: "ACCEPT", reason: {} },
])("rejects invalid request %j", (value) => {
  expect(parseOrderRequestDecision(value)).toBeNull();
});
it.each([false, true])(
  "accepts actual and replayed decisions: replay=%s",
  (idempotentReplay) => {
    expect(
      isOrderRequestDecisionResult({
        requestId,
        status: "ACCEPTED",
        orderId,
        idempotentReplay,
      }),
    ).toBe(true);
    expect(
      isOrderRequestDecisionResult({
        requestId,
        status: "REJECTED",
        orderId: null,
        idempotentReplay,
      }),
    ).toBe(true);
  },
);
it.each([
  { status: "PENDING_REVIEW" },
  { status: "accepted" },
  { requestId: "fixture-1" },
  { orderId: null },
  { orderId: "invalid" },
  { idempotentReplay: "false" },
  { status: "REJECTED" },
])("rejects inconsistent successful responses %j", (invalid) => {
  expect(
    isOrderRequestDecisionResult({
      requestId,
      status: "ACCEPTED",
      orderId,
      idempotentReplay: false,
      ...invalid,
    }),
  ).toBe(false);
});
it("requires all response fields", () => {
  expect(isOrderRequestDecisionResult(null)).toBe(false);
  expect(
    isOrderRequestDecisionResult({
      requestId,
      status: "REJECTED",
      idempotentReplay: false,
    }),
  ).toBe(false);
});
