import { it, expect } from "vitest";
import {
  parseReservation,
  isReservationResult,
  isReservationHistory,
} from "./live-contract";
it.each([0, 51, 1.5, NaN])("rejects invalid group size %s", (guests) =>
  expect(
    parseReservation({
      guests,
      requestedAt: "2026-12-01T20:00:00Z",
      preorder: false,
      notes: "",
    }),
  ).toBeNull(),
);
it("accepts legacy nullable history snapshots", () =>
  expect(
    isReservationHistory([
      {
        requestId: "11111111-1111-4111-8111-111111111111",
        requestedAt: null,
        guests: null,
        decision: "REJECT",
        message: "No disponible",
        submittedAt: "2026-10-02T20:00:00Z",
      },
    ]),
  ).toBe(true));
it("requires a reservation id for a submitted result", () =>
  expect(
    isReservationResult({
      requestId: "11111111-1111-4111-8111-111111111111",
      submitted: true,
      decision: "REQUIRES_HUMAN_APPROVAL",
      reasonCodes: [],
      minimumOccupancyMinutes: 60,
      maximumOccupancyMinutes: 120,
      message: "Revisaremos",
    }),
  ).toBe(false));
