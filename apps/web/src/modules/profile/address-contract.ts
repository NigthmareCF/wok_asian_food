export type ClientAddress = Readonly<{
  addressId: string;
  label: string;
  address: string;
  reference: string | null;
  contactPhone: string;
  isDefault: boolean;
  version: number;
}>;

export type CreateClientAddress = Readonly<{
  label: string;
  address: string;
  reference: string;
  contactPhone: string;
  isDefault: boolean;
}>;

export type UpdateClientAddress = CreateClientAddress &
  Readonly<{
    expectedVersion: number;
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

export function isClientAddress(value: unknown): value is ClientAddress {
  if (!isRecord(value)) return false;
  return (
    isUuid(value.addressId) &&
    typeof value.label === "string" &&
    value.label.trim().length >= 1 &&
    value.label.length <= 80 &&
    typeof value.address === "string" &&
    value.address.trim().length >= 5 &&
    value.address.length <= 500 &&
    (value.reference == null ||
      (typeof value.reference === "string" && value.reference.length <= 300)) &&
    typeof value.contactPhone === "string" &&
    /^[0-9+() .-]{7,32}$/.test(value.contactPhone) &&
    typeof value.isDefault === "boolean" &&
    typeof value.version === "number" &&
    Number.isSafeInteger(value.version) &&
    value.version > 0
  );
}

export function isClientAddressList(value: unknown): value is ClientAddress[] {
  return Array.isArray(value) && value.every(isClientAddress);
}

export function normalizeClientAddress(value: unknown): unknown {
  return isClientAddress(value)
    ? { ...value, reference: value.reference ?? null }
    : value;
}

export function normalizeClientAddresses(value: unknown): unknown {
  return Array.isArray(value) ? value.map(normalizeClientAddress) : value;
}

function parseAddressFields(value: unknown): CreateClientAddress | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.label !== "string" ||
    value.label.trim().length < 1 ||
    value.label.trim().length > 80 ||
    typeof value.address !== "string" ||
    value.address.trim().length < 5 ||
    value.address.trim().length > 500 ||
    (value.reference !== undefined &&
      value.reference !== null &&
      typeof value.reference !== "string") ||
    (typeof value.reference === "string" &&
      value.reference.trim().length > 300) ||
    typeof value.contactPhone !== "string" ||
    !/^[0-9+() .-]{7,32}$/.test(value.contactPhone.trim()) ||
    typeof value.isDefault !== "boolean"
  )
    return null;
  return {
    label: value.label.trim(),
    address: value.address.trim(),
    reference:
      typeof value.reference === "string" ? value.reference.trim() : "",
    contactPhone: value.contactPhone.trim(),
    isDefault: value.isDefault,
  };
}

export function parseCreateClientAddress(
  value: unknown,
): CreateClientAddress | null {
  return parseAddressFields(value);
}

export function parseUpdateClientAddress(
  value: unknown,
): UpdateClientAddress | null {
  const fields = parseAddressFields(value);
  if (!fields || !isRecord(value)) return null;
  if (
    typeof value.expectedVersion !== "number" ||
    !Number.isSafeInteger(value.expectedVersion) ||
    value.expectedVersion <= 0
  )
    return null;
  return { ...fields, expectedVersion: value.expectedVersion };
}
