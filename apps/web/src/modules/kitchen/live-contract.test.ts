import { describe, expect, it } from "vitest";
import {
  isKitchenTicket,
  isKitchenTickets,
  parseKitchenTicketStatus,
} from "./live-contract";

const ticket = {
  id: "11111111-1111-4111-8111-111111111111",
  orderId: "22222222-2222-4222-8222-222222222222",
  orderCode: "ORD-1001",
  sequence: 1,
  status: "QUEUED",
  rowVersion: 1,
  stationId: "33333333-3333-4333-8333-333333333333",
  stationCode: "WOK",
  claimedBy: null,
  claimedAt: null,
  readyAt: null,
  estimatedReadyAt: "2026-10-04T12:15:00Z",
  channel: "DINE_IN",
  diningTableName: "Mesa 4",
  accountName: "Cuenta principal",
  itemCount: 1,
  totalQuantity: 2,
  oldestItemAt: "2026-10-04T12:00:00Z",
  items: [
    {
      orderItemId: "44444444-4444-4444-8444-444444444444",
      name: "Wok de pollo",
      quantity: 2,
      action: "NEW",
      fulfillment: "DINE_IN",
      notes: "Sin cebolla",
    },
  ],
};

describe("kitchen live contract", () => {
  it("accepts complete tickets and ticket lists", () => {
    expect(isKitchenTicket(ticket)).toBe(true);
    expect(isKitchenTickets([ticket])).toBe(true);
  });

  it("rejects malformed ticket items", () => {
    expect(
      isKitchenTicket({
        ...ticket,
        items: [{ ...ticket.items[0], quantity: 0 }],
      }),
    ).toBe(false);
  });

  it("normalizes a valid status mutation", () => {
    expect(
      parseKitchenTicketStatus({
        status: "READY",
        expectedVersion: 2,
        reason: "  Plato terminado  ",
      }),
    ).toEqual({
      status: "READY",
      expectedVersion: 2,
      reason: "Plato terminado",
    });
  });

  it("rejects invalid status mutations", () => {
    expect(
      parseKitchenTicketStatus({ status: "SERVED", expectedVersion: 1 }),
    ).toBeNull();
    expect(
      parseKitchenTicketStatus({ status: "READY", expectedVersion: 0 }),
    ).toBeNull();
  });
});
