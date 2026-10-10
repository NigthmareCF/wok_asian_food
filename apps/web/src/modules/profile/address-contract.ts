import { isUuid } from "@/modules/checkout/pickup-contract";
import { record } from "@/modules/client-workflows/validation";

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
  Readonly<{ expectedVersion: number }>;

function isAddressFields(value: Record<string, unknown>) {
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
    Number.isSafeInteger(value.version) &&
    Number(value.version) > 0
  );
}

export function isClientAddress(value: unknown): value is ClientAddress {
  return record(value) && isAddressFields(value);
}

export function normalizeClientAddress(value: unknown): unknown {
  return isClientAddress(value)
    ? { ...value, reference: value.reference ?? null }
    : value;
}

export function isClientAddressList(value: unknown): value is ClientAddress[] {
  return Array.isArray(value) && value.every(isClientAddress);
}

export function normalizeClientAddressList(value: unknown): unknown {
  return isClientAddressList(value)
    ? value.map((address) => normalizeClientAddress(address))
    : value;
}

function parseFields(value: unknown): CreateClientAddress | null {
  if (!record(value)) return null;
  if (
    typeof value.label !== "string" ||
    value.label.trim().length < 1 ||
    value.label.trim().length > 80 ||
    typeof value.address !== "string" ||
    value.address.trim().length < 5 ||
    value.address.trim().length > 500 ||
    (value.reference != null && typeof value.reference !== "string") ||
    (typeof value.reference === "string" && value.reference.trim().length > 300) ||
    typeof value.contactPhone !== "string" ||
    !/^[0-9+() .-]{7,32}$/.test(value.contactPhone.trim()) ||
    typeof value.isDefault !== "boolean"
  )
    return null;
  return {
    label: value.label.trim(),
    address: value.address.trim(),
    reference: typeof value.reference === "string" ? value.reference.trim() : "",
    contactPhone: value.contactPhone.trim(),
    isDefault: value.isDefault,
  };
}

export function parseCreateClientAddress(value: unknown): CreateClientAddress | null {
  return parseFields(value);
}

export function parseUpdateClientAddress(value: unknown): UpdateClientAddress | null {
  const fields = parseFields(value);
  if (!fields || !record(value)) return null;
  return typeof value.expectedVersion === "number" && Number.isSafeInteger(value.expectedVersion) && value.expectedVersion > 0
    ? { ...fields, expectedVersion: value.expectedVersion }
    : null;
}
