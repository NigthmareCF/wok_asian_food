import { expect, it } from "vitest";
import {
  parseCashClose,
  parseCashMovement,
  parseCashOpen,
} from "./live-contract";
it("requires an original positive count version", () => {
  expect(parseCashClose({ countedCash: 100, expectedVersion: 0 })).toBeNull();
  expect(parseCashClose({ countedCash: 100, expectedVersion: 2 })).toEqual({
    countedCash: 100,
    expectedVersion: 2,
  });
});
it("rejects unsupported deposit and fractional cents", () => {
  expect(
    parseCashMovement({ type: "DEPOSIT", amount: 10, reason: "deposit" }),
  ).toBeNull();
  expect(
    parseCashOpen({ registerCode: "MAIN", openingFloat: 0.001 }),
  ).toBeNull();
});

it("accepts opening without a client-supplied currency", () => {
  expect(parseCashOpen({ registerCode: "MAIN", openingFloat: 100 })).toEqual({
    registerCode: "MAIN",
    openingFloat: 100,
  });
});
