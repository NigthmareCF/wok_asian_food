import { isUuid } from "@/modules/checkout/pickup-contract";
import { money, object } from "@/modules/payments/live-contract";

export type CashSession = {
  id: string;
  registerCode: string;
  currency: string;
  status: "OPEN" | "CLOSING" | "CLOSED";
  rowVersion: number;
  expectedCash: number;
  countedCash?: number;
  difference?: number;
  movements: {
    id: string;
    type: string;
    amountDelta: number;
    reason: string;
    occurredAt: string;
  }[];
  breakdown: {
    opening: number;
    sales: number;
    tips: number;
    otherIncome: number;
    expenses: number;
    withdrawals: number;
    expectedCash: number;
  };
};
export function isCashSession(v: unknown): v is CashSession {
  return (
    object(v) &&
    isUuid(v.id) &&
    typeof v.registerCode === "string" &&
    typeof v.currency === "string" &&
    /^[A-Z]{3}$/.test(v.currency) &&
    ["OPEN", "CLOSING", "CLOSED"].includes(String(v.status)) &&
    Number.isInteger(v.rowVersion) &&
    Number(v.rowVersion) > 0 &&
    money(v.expectedCash) &&
    object(v.breakdown) &&
    [
      "opening",
      "sales",
      "tips",
      "otherIncome",
      "expenses",
      "withdrawals",
      "expectedCash",
    ].every((k) => money((v.breakdown as Record<string, unknown>)[k])) &&
    Array.isArray(v.movements) &&
    v.movements.every(
      (m) =>
        object(m) &&
        isUuid(m.id) &&
        typeof m.type === "string" &&
        money(m.amountDelta) &&
        typeof m.reason === "string" &&
        typeof m.occurredAt === "string",
    ) &&
    (v.countedCash === undefined || money(v.countedCash)) &&
    (v.difference === undefined || money(v.difference))
  );
}
export function parseCashOpen(v: unknown) {
  return object(v) &&
    typeof v.registerCode === "string" &&
    /^[A-Z0-9_-]{1,32}$/.test(v.registerCode) &&
    money(v.openingFloat) &&
    v.openingFloat >= 0
    ? { registerCode: v.registerCode, openingFloat: v.openingFloat }
    : null;
}
export function parseCashClose(v: unknown) {
  return object(v) &&
    money(v.countedCash) &&
    v.countedCash >= 0 &&
    Number.isSafeInteger(v.expectedVersion) &&
    Number(v.expectedVersion) > 0
    ? { countedCash: v.countedCash, expectedVersion: v.expectedVersion }
    : null;
}
export function parseCashMovement(v: unknown) {
  return object(v) &&
    ["INCOME", "EXPENSE", "WITHDRAWAL"].includes(String(v.type)) &&
    money(v.amount) &&
    v.amount > 0 &&
    typeof v.reason === "string" &&
    v.reason.trim().length >= 3 &&
    v.reason.length <= 500
    ? { type: v.type, amount: v.amount, reason: v.reason.trim() }
    : null;
}
export function isCashMovement(v: unknown) {
  return (
    object(v) &&
    isUuid(v.id) &&
    typeof v.type === "string" &&
    money(v.amountDelta) &&
    typeof v.reason === "string"
  );
}
