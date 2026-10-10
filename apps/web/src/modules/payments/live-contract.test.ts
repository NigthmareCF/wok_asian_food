import { expect, it } from "vitest";
import { isAccountBalance, parseAmount, parsePayment } from "./live-contract";
it("requires cent precision and bounded positive payment values", () => {
  expect(parseAmount("10.10")).toBe(10.1);
  expect(parseAmount("10.005")).toBeNull();
  expect(parsePayment({ method: "TRANSFER", amount: 0 })).toBeNull();
  expect(parsePayment({ method: "TRANSFER", amount: 10.005 })).toBeNull();
  expect(parsePayment({ method: "online", amount: 10 })).toBeNull();
});
it("does not store references or bank/card details in a payment payload", () => {
  expect(
    parsePayment({ method: "CARD_EXTERNAL", amount: 10, reference: "bank" }),
  ).toBeNull();
  expect(
    parsePayment({ method: "CARD_EXTERNAL", amount: 10, cardNumber: "123" }),
  ).toBeNull();
});
it("rejects malformed financial balances", () => {
  expect(isAccountBalance({ total: 100, balance: 0 })).toBe(false);
});
