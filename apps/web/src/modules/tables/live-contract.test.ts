import { describe, expect, it } from "vitest";
import {
  isOperationalTable,
  isOperationalTables,
  parseCreateOperationalTable,
} from "./live-contract";

const table = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Mesa pagada",
  capacity: 4,
  zone: "Principal",
  active: true,
  status: "OCCUPIED",
  rowVersion: 2,
  updatedAt: "2026-10-06T00:00:00Z",
  accountId: "22222222-2222-4222-8222-222222222222",
  accountName: "Cuenta",
  accountStatus: "PAID",
};

it.each(["OPEN", "IN_COBRO", "PAID"])(
  "accepts account state %s without changing the table state",
  (accountStatus) => {
    const value = { ...table, accountStatus };
    expect(isOperationalTable(value)).toBe(true);
    expect(isOperationalTables([value])).toBe(true);
    expect(value.status).toBe("OCCUPIED");
  },
);

it.each(["UNKNOWN", "CLOSED", "paid", "", null])(
  "rejects an invalid associated account state %s",
  (accountStatus) => {
    expect(isOperationalTable({ ...table, accountStatus })).toBe(false);
    expect(isOperationalTables([table, { ...table, accountStatus }])).toBe(
      false,
    );
  },
);

it("continues rejecting unknown physical table states", () => {
  expect(isOperationalTable({ ...table, status: "PAID" })).toBe(false);
});

describe("live table contract", () => {
  const table = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Mesa 01",
    capacity: 4,
    zone: "PRINCIPAL",
    active: true,
    status: "FREE",
    rowVersion: 1,
    updatedAt: "2026-10-03T10:00:00Z",
    accountId: null,
    accountName: null,
    accountStatus: null,
  };

  it("accepts only the real table response fields", () => {
    expect(isOperationalTable(table)).toBe(true);
    expect(isOperationalTables([table])).toBe(true);
    expect(isOperationalTable({ ...table, accountId: "invalid" })).toBe(false);
    expect(isOperationalTable({ ...table, status: "pending-payment" })).toBe(
      false,
    );
  });

  it("normalizes valid creation input and rejects invalid values", () => {
    expect(
      parseCreateOperationalTable({
        name: " Mesa 14 ",
        capacity: 6,
        zone: " Terraza ",
      }),
    ).toEqual({ name: "Mesa 14", capacity: 6, zone: "Terraza" });
    expect(
      parseCreateOperationalTable({ name: "", capacity: 0, zone: "x" }),
    ).toBeNull();
  });
});

it("accepts paid accounts returned by the tables API without rejecting the whole list", () => {
  const paidTable = {
    ...table,
    status: "OCCUPIED",
    accountId: "22222222-2222-4222-8222-222222222222",
    accountName: "Cuenta 1",
    accountStatus: "PAID",
  };
  expect(isOperationalTables([table, paidTable])).toBe(true);
  expect(isOperationalTable({ ...paidTable, accountStatus: "UNKNOWN" })).toBe(
    false,
  );
  expect(isOperationalTable({ ...paidTable, accountId: null })).toBe(false);
});
