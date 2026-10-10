import { isUuid } from "@/modules/checkout/pickup-contract";
import { record } from "@/modules/client-workflows/validation";
export type ClientProfile = {
  userId: string;
  email: string;
  displayName: string;
  phone?: string | null;
  version: number;
};
export type ProfileUpdate = {
  displayName: string;
  phone: string;
  expectedVersion: number;
};
export function isClientProfile(value: unknown): value is ClientProfile {
  return (
    record(value) &&
    isUuid(value.userId) &&
    typeof value.email === "string" &&
    typeof value.displayName === "string" &&
    (value.phone == null || typeof value.phone === "string") &&
    Number.isSafeInteger(value.version) &&
    Number(value.version) > 0
  );
}
export function normalizeClientProfile(value: unknown): unknown {
  return isClientProfile(value)
    ? { ...value, phone: value.phone ?? null }
    : value;
}
export function parseProfileUpdate(value: unknown): ProfileUpdate | null {
  if (
    !record(value) ||
    typeof value.displayName !== "string" ||
    value.displayName.trim().length < 2 ||
    value.displayName.length > 100 ||
    typeof value.phone !== "string" ||
    !/^$|^[+0-9() .-]{7,25}$/.test(value.phone) ||
    !Number.isSafeInteger(value.expectedVersion) ||
    Number(value.expectedVersion) <= 0
  )
    return null;
  return {
    displayName: value.displayName.trim(),
    phone: value.phone.trim(),
    expectedVersion: Number(value.expectedVersion),
  };
}
