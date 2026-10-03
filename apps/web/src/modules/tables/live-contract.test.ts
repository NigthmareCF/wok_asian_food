import { describe, expect, it } from "vitest";
import {
  isOperationalTable,
  isOperationalTables,
  parseCreateOperationalTable,
} from "./live-contract";

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

describe("live table contract", () => {
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
