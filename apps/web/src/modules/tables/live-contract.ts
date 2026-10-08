import { isUuid } from "@/modules/checkout/pickup-contract";
import { instant, record } from "@/modules/client-workflows/validation";

const statuses = [
  "FREE",
  "OCCUPIED",
  "RESERVED",
  "CLEANING",
  "UNAVAILABLE",
] as const;
const accountStatuses = ["OPEN", "IN_COBRO", "PAID"] as const;

export type OperationalTableStatus = (typeof statuses)[number];

export type OperationalTable = {
  id: string;
  name: string;
  capacity: number;
  zone: string;
  active: boolean;
  status: OperationalTableStatus;
  rowVersion: number;
  updatedAt: string;
  accountId: string | null;
  accountName: string | null;
  accountStatus: (typeof accountStatuses)[number] | null;
};

export type CreateOperationalTable = {
  name: string;
  capacity: number;
  zone: string;
};

export function isOperationalTable(value: unknown): value is OperationalTable {
  if (
    !record(value) ||
    !isUuid(value.id) ||
    typeof value.name !== "string" ||
    value.name.trim().length < 1 ||
    typeof value.capacity !== "number" ||
    !Number.isSafeInteger(value.capacity) ||
    value.capacity <= 0 ||
    typeof value.zone !== "string" ||
    value.zone.trim().length < 1 ||
    typeof value.active !== "boolean" ||
    !statuses.includes(value.status as OperationalTableStatus) ||
    !Number.isSafeInteger(value.rowVersion) ||
    Number(value.rowVersion) <= 0 ||
    !instant(value.updatedAt)
  )
    return false;

  const noAccount =
    value.accountId == null &&
    value.accountName == null &&
    value.accountStatus == null;
  const account =
    isUuid(value.accountId) &&
    typeof value.accountName === "string" &&
    value.accountName.trim().length > 0 &&
    accountStatuses.includes(
      value.accountStatus as (typeof accountStatuses)[number],
    );
  return noAccount || account;
}

export function isOperationalTables(
  value: unknown,
): value is OperationalTable[] {
  return Array.isArray(value) && value.every(isOperationalTable);
}

export function parseCreateOperationalTable(
  value: unknown,
): CreateOperationalTable | null {
  if (
    !record(value) ||
    typeof value.name !== "string" ||
    value.name.trim().length < 1 ||
    value.name.trim().length > 40 ||
    !Number.isSafeInteger(value.capacity) ||
    Number(value.capacity) <= 0 ||
    typeof value.zone !== "string" ||
    value.zone.trim().length < 2 ||
    value.zone.trim().length > 40
  )
    return null;

  return {
    name: value.name.trim(),
    capacity: Number(value.capacity),
    zone: value.zone.trim(),
  };
}
