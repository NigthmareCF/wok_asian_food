import { isUuid } from "@/modules/checkout/pickup-contract";

export const supportedAdminRoleCodes = ["OPERATIONAL", "ADMIN"] as const;
export type SupportedAdminRoleCode = (typeof supportedAdminRoleCodes)[number];
export type RoleAction = "GRANT" | "REVOKE";

export type AdminUserRecord = {
  id: string;
  email: string;
  displayName: string;
  status: string;
  rowVersion: number;
  createdAt: string;
  roles: string[];
};

export type AdminRoleChange = {
  action: RoleAction;
  reason: string;
  expectedVersion: number;
};

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object";

const instant = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

export function isSupportedAdminRoleCode(
  value: unknown,
): value is SupportedAdminRoleCode {
  return (
    typeof value === "string" &&
    supportedAdminRoleCodes.includes(value as SupportedAdminRoleCode)
  );
}

export function isAdminUser(value: unknown): value is AdminUserRecord {
  return (
    record(value) &&
    isUuid(value.id) &&
    typeof value.email === "string" &&
    typeof value.displayName === "string" &&
    typeof value.status === "string" &&
    typeof value.rowVersion === "number" &&
    Number.isSafeInteger(value.rowVersion) &&
    value.rowVersion > 0 &&
    instant(value.createdAt) &&
    Array.isArray(value.roles) &&
    value.roles.every((role) => typeof role === "string")
  );
}

export function isAdminUserList(value: unknown): value is AdminUserRecord[] {
  return Array.isArray(value) && value.every(isAdminUser);
}

export function parseAdminRoleChange(value: unknown): AdminRoleChange | null {
  if (
    !record(value) ||
    (value.action !== "GRANT" && value.action !== "REVOKE") ||
    typeof value.reason !== "string" ||
    value.reason.trim().length < 3 ||
    value.reason.trim().length > 500 ||
    !Number.isSafeInteger(value.expectedVersion) ||
    Number(value.expectedVersion) < 1
  )
    return null;
  return {
    action: value.action,
    reason: value.reason.trim(),
    expectedVersion: Number(value.expectedVersion),
  };
}
