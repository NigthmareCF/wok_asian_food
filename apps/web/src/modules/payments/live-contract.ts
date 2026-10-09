import { isUuid } from "@/modules/checkout/pickup-contract";

export type PaymentMethod = "CASH" | "CARD_EXTERNAL" | "TRANSFER";
export type PaymentInput = {
  method: PaymentMethod;
  amount: number;
  tipAmount?: number;
  registerCode?: string;
};
export type AccountSummary = {
  id: string;
  name: string;
  status: string;
  diningTableId: string | null;
  diningTableName: string | null;
  rowVersion: number;
};
export type CurrencyTotal = {
  currency: string;
  total: number;
  paid: number;
  balance: number;
  tips: number;
};
export type AccountBalance = {
  account: AccountSummary;
  total?: number | null;
  paid?: number | null;
  balance?: number | null;
  tips?: number | null;
  currencies: string[];
  currencyTotals: CurrencyTotal[];
  orderCount?: number;
  pendingOrderCount: number;
  unfinalizedOrderCount: number;
};
export type FinancialItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};
export type FinancialOrder = {
  id: string;
  code: string;
  status: string;
  channel: string;
  total: number;
  subtotal: number;
  discount: number;
  currency: string;
  rowVersion: number;
  items: FinancialItem[];
};
export type FinancialPayment = {
  id: string;
  amount: number;
  tipAmount: number;
  method: string;
  status: string;
  capturedAt: string;
  currency: string;
  reference?: string | null;
};
export type AccountDetails = AccountBalance & {
  orders: FinancialOrder[];
  payments: FinancialPayment[];
};
export type PaymentReceipt = {
  paymentId: string;
  accountId: string;
  accountStatus: string;
  amount: number;
  tipAmount: number;
  currency: string;
  method: PaymentMethod;
  status: string;
  balance: number;
  idempotentReplay: boolean;
  cashSessionId?: string | null;
};

export const paymentMethods = [
  { value: "CASH", label: "Efectivo" },
  { value: "CARD_EXTERNAL", label: "Tarjeta externa registrada" },
  { value: "TRANSFER", label: "Transferencia registrada" },
] as const;
export const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export const money = (v: unknown): v is number =>
  typeof v === "number" &&
  Number.isFinite(v) &&
  Math.abs(v) < 1e12 &&
  Math.round(v * 100) / 100 === v;
const text = (v: unknown): v is string => typeof v === "string";
const count = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
export function parseAmount(value: string): number | null {
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(value)) return null;
  const n = Number(value);
  return money(n) ? n : null;
}
export function formatMoney(
  value: number | null | undefined,
  currency = "GTQ",
) {
  return value == null
    ? "No agregable entre monedas"
    : new Intl.NumberFormat("es-GT", { style: "currency", currency }).format(
        value,
      );
}
export function isAccountBalance(v: unknown): v is AccountBalance {
  if (
    !object(v) ||
    !object(v.account) ||
    !isUuid(v.account.id) ||
    !text(v.account.name) ||
    !text(v.account.status) ||
    !(v.account.diningTableId == null || isUuid(v.account.diningTableId)) ||
    !(v.account.diningTableName == null || text(v.account.diningTableName)) ||
    !count(v.account.rowVersion) ||
    !Array.isArray(v.currencies) ||
    !v.currencies.every((c) => typeof c === "string" && /^[A-Z]{3}$/.test(c)) ||
    !count(v.pendingOrderCount) ||
    !count(v.unfinalizedOrderCount) ||
    !Array.isArray(v.currencyTotals)
  )
    return false;
  const mixed = v.currencies.length > 1;
  return (
    [v.total, v.paid, v.balance, v.tips].every((n) =>
      mixed ? n == null : money(n),
    ) &&
    v.currencyTotals.every(
      (t) =>
        object(t) &&
        text(t.currency) &&
        [t.total, t.paid, t.balance, t.tips].every(money),
    )
  );
}
export const isAccountBalances = (v: unknown): v is AccountBalance[] =>
  Array.isArray(v) && v.every(isAccountBalance);
export function isAccountDetails(v: unknown): v is AccountDetails {
  if (!isAccountBalance(v)) return false;
  const details = v as unknown as Record<string, unknown>;
  return (
    Array.isArray(details.orders) &&
    details.orders.every(
      (o) =>
        object(o) &&
        isUuid(o.id) &&
        text(o.code) &&
        text(o.status) &&
        text(o.channel) &&
        text(o.currency) &&
        count(o.rowVersion) &&
        [o.total, o.subtotal, o.discount].every(money) &&
        Array.isArray(o.items) &&
        o.items.every(
          (i) =>
            object(i) &&
            isUuid(i.id) &&
            text(i.name) &&
            count(i.quantity) &&
            i.quantity > 0 &&
            money(i.unitPrice) &&
            money(i.lineTotal),
        ),
    ) &&
    Array.isArray(details.payments) &&
    details.payments.every(
      (p) =>
        object(p) &&
        isUuid(p.id) &&
        money(p.amount) &&
        money(p.tipAmount) &&
        text(p.method) &&
        text(p.status) &&
        text(p.currency) &&
        text(p.capturedAt),
    )
  );
}
export function isPaymentReceipt(v: unknown): v is PaymentReceipt {
  return (
    object(v) &&
    isUuid(v.paymentId) &&
    isUuid(v.accountId) &&
    text(v.accountStatus) &&
    money(v.amount) &&
    money(v.tipAmount) &&
    money(v.balance) &&
    text(v.currency) &&
    paymentMethods.some((m) => m.value === v.method) &&
    text(v.status) &&
    typeof v.idempotentReplay === "boolean"
  );
}
export function parsePayment(v: unknown): PaymentInput | null {
  if (
    !object(v) ||
    Object.keys(v).some(
      (k) => !["method", "amount", "tipAmount", "registerCode"].includes(k),
    ) ||
    !paymentMethods.some((m) => m.value === v.method) ||
    !money(v.amount) ||
    v.amount <= 0 ||
    (v.tipAmount !== undefined && (!money(v.tipAmount) || v.tipAmount < 0)) ||
    (v.registerCode !== undefined &&
      (typeof v.registerCode !== "string" ||
        !/^[A-Z0-9_-]{1,32}$/.test(v.registerCode)))
  )
    return null;
  return {
    method: v.method as PaymentMethod,
    amount: v.amount,
    ...(v.tipAmount !== undefined ? { tipAmount: v.tipAmount as number } : {}),
    ...(v.registerCode !== undefined
      ? { registerCode: v.registerCode as string }
      : {}),
  };
}
export const financialErrors = {
  404: "No hay confirmación disponible o no encontramos el registro. Un cobro incierto sigue pendiente.",
  409: "El saldo, la versión, el estado o la clave cambió. Consulta el estado antes de continuar.",
  422: "Revisa el importe, la moneda y los consumos; deben estar servidos y permitir el cobro.",
};
