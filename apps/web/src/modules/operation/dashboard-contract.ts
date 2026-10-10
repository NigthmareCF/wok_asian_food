import { isUuid } from "@/modules/checkout/pickup-contract";
import { instant, record } from "@/modules/client-workflows/validation";

// Contratos StationLoad y OrderSummary de los controladores existentes.
export type StationLoad = {
  stationId: string;
  stationCode: string;
  queued: number;
  preparing: number;
  ready: number;
  oldestQueuedAt: string | null;
};
export type OrderSummary = {
  id: string;
  code: string;
  status: string;
  channel: string;
  subtotal: number;
  discount: number;
  total: number;
  guestCount: number;
  openedAt: string;
  closedAt: string | null;
  rowVersion: number;
  currencyId: string;
  currency: string;
  diningTableId: string | null;
  diningTableName: string | null;
  accountId: string;
  accountName: string;
  itemCount: number;
};
const count = (v: unknown) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const amount = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;
export function isStationLoads(v: unknown): v is StationLoad[] {
  return (
    Array.isArray(v) &&
    v.every(
      (r) =>
        record(r) &&
        isUuid(r.stationId) &&
        typeof r.stationCode === "string" &&
        count(r.queued) &&
        count(r.preparing) &&
        count(r.ready) &&
        (r.oldestQueuedAt == null || instant(r.oldestQueuedAt)),
    )
  );
}
export function normalizeStationLoads(value: unknown): unknown {
  return isStationLoads(value)
    ? value.map((station) => ({
        ...station,
        oldestQueuedAt: station.oldestQueuedAt ?? null,
      }))
    : value;
}
export function isOrderSummaries(v: unknown): v is OrderSummary[] {
  return (
    Array.isArray(v) &&
    v.every(
      (r) =>
        record(r) &&
        isUuid(r.id) &&
        typeof r.code === "string" &&
        [
          "SENT",
          "PREPARING",
          "READY",
          "SERVED",
          "CLOSED",
          "CANCELLED",
        ].includes(String(r.status)) &&
        ["DINE_IN", "PICKUP", "DELIVERY"].includes(String(r.channel)) &&
        amount(r.subtotal) &&
        amount(r.discount) &&
        amount(r.total) &&
        count(r.guestCount) &&
        instant(r.openedAt) &&
        (r.closedAt === null || instant(r.closedAt)) &&
        count(r.rowVersion) &&
        Number(r.rowVersion) > 0 &&
        isUuid(r.currencyId) &&
        typeof r.currency === "string" &&
        (r.diningTableId === null || isUuid(r.diningTableId)) &&
        (r.diningTableName === null || typeof r.diningTableName === "string") &&
        isUuid(r.accountId) &&
        typeof r.accountName === "string" &&
        count(r.itemCount),
    )
  );
}
