export const capabilityStatuses = [
  "ENABLED",
  "MANUAL_APPROVAL",
  "PAUSED",
  "DISABLED",
] as const;
export type CapabilityStatus = (typeof capabilityStatuses)[number];

export type AdminServiceCapability = {
  code: string;
  status: CapabilityStatus;
  reason: string;
  rowVersion: number;
  policyVersion: number;
  effectiveFrom: string;
  effectiveUntil: string | null;
};

export type CapabilityChange = {
  status: CapabilityStatus;
  reason: string;
  expectedVersion: number;
};

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object";

const instant = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

export function isCapabilityStatus(value: unknown): value is CapabilityStatus {
  return (
    typeof value === "string" &&
    capabilityStatuses.includes(value as CapabilityStatus)
  );
}

export function isAdminServiceCapability(
  value: unknown,
): value is AdminServiceCapability {
  return (
    record(value) &&
    typeof value.code === "string" &&
    value.code.length > 0 &&
    isCapabilityStatus(value.status) &&
    typeof value.reason === "string" &&
    typeof value.rowVersion === "number" &&
    Number.isSafeInteger(value.rowVersion) &&
    value.rowVersion > 0 &&
    typeof value.policyVersion === "number" &&
    Number.isSafeInteger(value.policyVersion) &&
    value.policyVersion > 0 &&
    instant(value.effectiveFrom) &&
    (value.effectiveUntil == null || instant(value.effectiveUntil))
  );
}

export function isAdminServiceCapabilityList(
  value: unknown,
): value is AdminServiceCapability[] {
  return Array.isArray(value) && value.every(isAdminServiceCapability);
}
export function normalizeAdminCapabilities(value: unknown): unknown {
  return isAdminServiceCapabilityList(value)
    ? value.map((capability) => ({
        ...capability,
        effectiveUntil: capability.effectiveUntil ?? null,
      }))
    : value;
}

export function parseCapabilityChange(value: unknown): CapabilityChange | null {
  if (
    !record(value) ||
    !isCapabilityStatus(value.status) ||
    typeof value.reason !== "string" ||
    value.reason.trim().length < 3 ||
    value.reason.trim().length > 500 ||
    typeof value.expectedVersion !== "number" ||
    !Number.isSafeInteger(value.expectedVersion) ||
    value.expectedVersion < 1
  )
    return null;
  return {
    status: value.status,
    reason: value.reason.trim(),
    expectedVersion: value.expectedVersion,
  };
}
