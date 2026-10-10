import { isUuid } from "@/modules/checkout/pickup-contract";
import { record, instant } from "@/modules/client-workflows/validation";
export type ManagedUser = {
  id: string;
  email: string;
  displayName: string;
  status: string;
  rowVersion: number;
  createdAt: string;
  roles: string[];
};
export type RoleChange = {
  action: "GRANT" | "REVOKE";
  reason: string;
  expectedVersion: number;
};
export function isManagedUser(value: unknown): value is ManagedUser {
  return (
    record(value) &&
    isUuid(value.id) &&
    typeof value.email === "string" &&
    typeof value.displayName === "string" &&
    typeof value.status === "string" &&
    Number.isSafeInteger(value.rowVersion) &&
    Number(value.rowVersion) > 0 &&
    instant(value.createdAt) &&
    Array.isArray(value.roles) &&
    value.roles.every((role) => typeof role === "string")
  );
}
export const isManagedUsers = (value: unknown): value is ManagedUser[] =>
  Array.isArray(value) && value.every(isManagedUser);
export function parseRoleChange(value: unknown): RoleChange | null {
  if (
    !record(value) ||
    !["GRANT", "REVOKE"].includes(String(value.action)) ||
    typeof value.reason !== "string" ||
    value.reason.trim().length < 3 ||
    value.reason.trim().length > 500 ||
    !Number.isSafeInteger(value.expectedVersion) ||
    Number(value.expectedVersion) <= 0
  )
    return null;
  return {
    action: value.action as RoleChange["action"],
    reason: value.reason.trim(),
    expectedVersion: Number(value.expectedVersion),
  };
}
