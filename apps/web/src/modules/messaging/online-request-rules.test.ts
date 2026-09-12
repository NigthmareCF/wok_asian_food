import { describe, expect, it } from "vitest";
import { type OnlineRequestRecord } from "@/data/fixtures/messaging";
import { operationalTables } from "@/data/fixtures/operation";
import {
  evaluateOnlineRequestRules,
  getAvailableTableForRequest,
} from "./online-request-rules";

const request = (overrides: Partial<OnlineRequestRecord>): OnlineRequestRecord =>
  ({
    id: "SOL-900",
    customer: "Prueba",
    phone: "+502 5555 0000",
    requestedAt: "Hace 1 min",
    date: "2026-09-11",
    time: "18:30",
    people: 4,
    preorder: false,
    status: "pending",
    lastValidatedAt: "13:00",
    kind: "delivery",
    ...overrides,
  }) as OnlineRequestRecord;

describe("evaluateOnlineRequestRules", () => {
  it("allows a delivery within service hours under normal service", () => {
    const result = evaluateOnlineRequestRules(request({}), {
      serviceStatus: "normal",
      tables: operationalTables,
    });
    expect(result.blocked).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("blocks every modality while services are suspended", () => {
    const result = evaluateOnlineRequestRules(request({}), {
      serviceStatus: "suspended",
      tables: operationalTables,
    });
    expect(result.blocked).toContain("suspended");
  });

  it("warns about high demand without blocking", () => {
    const result = evaluateOnlineRequestRules(request({}), {
      serviceStatus: "high-demand",
      tables: operationalTables,
    });
    expect(result.blocked).toEqual([]);
    expect(result.warnings).toContain("high-demand");
  });

  it("blocks non-pickup modalities in pickup-only mode", () => {
    for (const kind of ["delivery", "dine-in", "reservation"] as const) {
      const result = evaluateOnlineRequestRules(request({ kind }), {
        serviceStatus: "pickup-only",
        tables: operationalTables,
      });
      expect(result.blocked).toContain("pickup-only-blocked");
    }
  });

  it("blocks requests outside service hours", () => {
    const result = evaluateOnlineRequestRules(
      request({ time: "23:00", kind: "pickup" }),
      {
        serviceStatus: "normal",
        tables: operationalTables,
      },
    );
    expect(result.blocked).toContain("out-of-hours");
  });

  it("blocks a table modality when no table has enough capacity", () => {
    const result = evaluateOnlineRequestRules(
      request({ kind: "reservation", people: 8 }),
      {
        serviceStatus: "normal",
        tables: operationalTables,
      },
    );
    expect(result.blocked).toContain("table-unavailable");
  });

  it("allows a reservation when a free table fits the party", () => {
    const result = evaluateOnlineRequestRules(
      request({ kind: "reservation", people: 4 }),
      {
        serviceStatus: "normal",
        tables: operationalTables,
      },
    );
    expect(result.blocked).not.toContain("table-unavailable");
  });
});

describe("getAvailableTableForRequest", () => {
  it("finds a free table with enough capacity", () => {
    const table = getAvailableTableForRequest(
      request({ kind: "dine-in", people: 4 }),
      operationalTables,
    );
    expect(table?.capacity).toBeGreaterThanOrEqual(4);
    expect(table?.status).toBe("free");
  });

  it("returns undefined when no free table fits", () => {
    const table = getAvailableTableForRequest(
      request({ kind: "dine-in", people: 8 }),
      operationalTables,
    );
    expect(table).toBeUndefined();
  });
});