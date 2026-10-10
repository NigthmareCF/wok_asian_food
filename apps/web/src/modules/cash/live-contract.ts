export type CashStatus = "OPEN" | "CLOSING" | "CLOSED";
export type CashMovementType =
  "OPENING" | "SALE" | "INCOME" | "EXPENSE" | "WITHDRAWAL";

export type CashMovement = {
  id: string;
  movementType: CashMovementType;
  amountDelta: number;
  reason: string;
  responsibleUserId: string;
  occurredAt: string;
};

export type CashBreakdown = {
  opening: number;
  sales: number;
  tips: number;
  income: number;
  expenses: number;
  withdrawals: number;
  balance: number;
};

export type CashReconciliation = {
  id: string;
  expectedCash: number;
  countedCash: number;
  difference: number;
  final: boolean;
  notes: string | null;
  countedAt: string;
};

export type CashSession = {
  id: string;
  registerCode: string;
  status: CashStatus;
  expectedCash: number;
  countedCash: number | null;
  difference: number | null;
  openedBy: string;
  openedAt: string;
  closedBy: string | null;
  closedAt: string | null;
  rowVersion: number;
  breakdown: CashBreakdown;
  reconciliations: CashReconciliation[];
  movements: CashMovement[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export function isCashSession(value: unknown): value is CashSession {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.registerCode === "string" &&
    ["OPEN", "CLOSING", "CLOSED"].includes(String(value.status)) &&
    typeof value.expectedCash === "number" &&
    typeof value.rowVersion === "number" &&
    Array.isArray(value.movements) &&
    Array.isArray(value.reconciliations) &&
    isRecord(value.breakdown)
  );
}

export function isCashMovement(value: unknown): value is CashMovement {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.amountDelta === "number"
  );
}
