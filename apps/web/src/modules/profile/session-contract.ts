export type ClientSession = Readonly<{
  sessionId: string;
  clientType: "WEB" | "MOBILE" | "DESKTOP";
  deviceName: string | null;
  createdAt: string;
  lastActivityAt: string;
  current: boolean;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function isDateTime(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export function isClientSession(value: unknown): value is ClientSession {
  if (!isRecord(value)) return false;
  return (
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

export function isClientSessionList(value: unknown): value is ClientSession[] {
  return Array.isArray(value) && value.every(isClientSession);
}

export function normalizeClientSessions(value: unknown): unknown {
  return Array.isArray(value)
    ? value.map((session: unknown) =>
        isClientSession(session)
          ? { ...session, deviceName: session.deviceName ?? null }
          : session,
      )
    : value;
}
