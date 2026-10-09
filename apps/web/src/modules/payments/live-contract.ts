export type OperationalAccount = {
  account: {
    id: string;
    name: string;
    status: string;
    diningTableId: string | null;
    diningTableName: string | null;
    openedAt: string;
    closedAt: string | null;
    rowVersion: number;
  };
  orders: Array<{ id: string; code: string; status: string; channel: string; total: number; openedAt: string; closedAt: string | null; itemCount: number }>;
  total: number;
  paid: number;
  balance: number;
  tips: number;
  payments: Array<{ id: string; amount: number; tipAmount: number; method: string; status: string; reference: string | null; capturedAt: string }>;
};

export type PaymentReceipt = {
  paymentId: string;
  accountId: string;
  accountStatus: string;
  amount: number;
  tipAmount: number;
  currency: string;
  method: string;
  status: string;
  reference: string | null;
  balance: number;
  cashSessionId: string | null;
  cashMovementId: string | null;
  idempotentReplay: boolean;
};

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
export const isOperationalAccount = (value: unknown): value is OperationalAccount =>
  record(value) && record(value.account) && typeof value.account.id === "string" && typeof value.total === "number" && typeof value.paid === "number" && typeof value.balance === "number" && Array.isArray(value.orders) && Array.isArray(value.payments);
export const isPaymentReceipt = (value: unknown): value is PaymentReceipt =>
  record(value) && typeof value.paymentId === "string" && typeof value.accountId === "string" && typeof value.amount === "number" && typeof value.balance === "number";

