import { isUuid } from "@/modules/checkout/pickup-contract";
import { instant, record } from "@/modules/client-workflows/validation";
import {
  count,
  optional,
  text,
  parseStatus,
} from "@/modules/operation/live-validation";
import {
  isOrderTicket,
  ticketStatuses,
  type OrderTicket,
} from "@/modules/orders/live-contract";

export type KitchenTicket = OrderTicket & {
  orderId: string;
  orderCode: string;
  claimedAt?: string | null;
  channel: "DINE_IN" | "PICKUP" | "DELIVERY";
  diningTableName?: string | null;
  accountName: string;
  itemCount: number;
  totalQuantity: number;
  oldestItemAt?: string | null;
};
export type StationLoad = {
  stationId: string;
  stationCode: string;
  queued: number;
  preparing: number;
  ready: number;
  oldestQueuedAt?: string | null;
};
export function isKitchenTicket(v: unknown): v is KitchenTicket {
  return (
    record(v) &&
    isUuid(v.orderId) &&
    text(v.orderCode) &&
    optional(v.claimedAt, instant) &&
    typeof v.channel === "string" &&
    ["DINE_IN", "PICKUP", "DELIVERY"].includes(v.channel) &&
    optional(v.diningTableName, text) &&
    text(v.accountName) &&
    count(v.itemCount) &&
    count(v.totalQuantity) &&
    optional(v.oldestItemAt, instant) &&
    isOrderTicket(v)
  );
}
export const isKitchenTickets = (v: unknown): v is KitchenTicket[] =>
  Array.isArray(v) && v.every(isKitchenTicket);
export function isStationLoad(v: unknown): v is StationLoad {
  return (
    record(v) &&
    isUuid(v.stationId) &&
    text(v.stationCode) &&
    count(v.queued) &&
    count(v.preparing) &&
    count(v.ready) &&
    optional(v.oldestQueuedAt, instant)
  );
}
export const isStationLoads = (v: unknown): v is StationLoad[] =>
  Array.isArray(v) && v.every(isStationLoad);
export const parseTicketStatus = (v: unknown) => parseStatus(v, ticketStatuses);
