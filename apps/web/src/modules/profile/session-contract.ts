import { isUuid } from "@/modules/checkout/pickup-contract";
import { record } from "@/modules/client-workflows/validation";

export type ClientSession = Readonly<{
  sessionId: string;
  clientType: "WEB" | "MOBILE" | "DESKTOP";
  deviceName: string | null;
  createdAt: string;
  lastActivityAt: string;
  current: boolean;
}>;

function isDateTime(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export function isClientSession(value: unknown): value is ClientSession {
  return (
    record(value) &&
    isUuid(value.sessionId) &&
    (value.clientType === "WEB" ||
      value.clientType === "MOBILE" ||
      value.clientType === "DESKTOP") &&
    (value.deviceName == null || typeof value.deviceName === "string") &&
    isDateTime(value.createdAt) &&
    isDateTime(value.lastActivityAt) &&
    typeof value.current === "boolean"
  );
}

export function normalizeClientSession(value: unknown): unknown {
  return isClientSession(value)
    ? { ...value, deviceName: value.deviceName ?? null }
    : value;
}

export function isClientSessionList(value: unknown): value is ClientSession[] {
  return Array.isArray(value) && value.every(isClientSession);
}

export function normalizeClientSessionList(value: unknown): unknown {
  return isClientSessionList(value)
    ? value.map((session) => normalizeClientSession(session))
    : value;
}
