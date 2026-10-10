export type ClientProfile = Readonly<{
  userId: string;
  email: string;
  displayName: string;
  phone: string | null;
  version: number;
}>;

export type UpdateProfile = Readonly<{
  displayName: string;
  phone: string;
  expectedVersion: number;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isClientProfile(value: unknown): value is ClientProfile {
  if (!isRecord(value)) return false;
  return (
    typeof value.userId === "string" &&
    typeof value.email === "string" &&
    typeof value.displayName === "string" &&
    (value.phone === null || typeof value.phone === "string") &&
    typeof value.version === "number" &&
    Number.isSafeInteger(value.version) &&
    value.version > 0
  );
}

export function parseUpdateProfile(value: unknown): UpdateProfile | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.displayName !== "string" ||
    value.displayName.trim().length < 2 ||
    value.displayName.trim().length > 100 ||
    typeof value.phone !== "string" ||
    !/^$|^[+0-9() .-]{7,25}$/.test(value.phone.trim()) ||
    typeof value.expectedVersion !== "number" ||
    !Number.isSafeInteger(value.expectedVersion) ||
    value.expectedVersion <= 0
  )
    return null;
  return {
    displayName: value.displayName.trim(),
    phone: value.phone.trim(),
    expectedVersion: value.expectedVersion,
  };
}
