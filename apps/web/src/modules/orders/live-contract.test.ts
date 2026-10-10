import { describe, expect, it } from "vitest";
import {
  isOperationalOrderDetails,
  isOperationalOrderSummaries,
  parseAddOperationalOrderItems,
  parseCreateOperationalOrder,
  parseOperationalOrderStatus,
} from "./live-contract";

const summary = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "ORD-20261004-0001",
  status: "READY",
  channel: "DINE_IN",
  subtotal: 90,
  discount: 0,
  total: 90,
  guestCount: 2,
  openedAt: "2026-10-04T12:00:00Z",
  closedAt: null,
  rowVersion: 3,
  currencyId: "22222222-2222-4222-8222-222222222222",
  currency: "GTQ",
  diningTableId: "33333333-3333-4333-8333-333333333333",
  diningTableName: "Mesa 4",
  accountId: "44444444-4444-4444-8444-444444444444",
  accountName: "Cuenta principal",
  itemCount: 1,
};

const details = {
  order: summary,
  items: [
    {
      id: "55555555-5555-4555-8555-555555555555",
      name: "Wok de pollo",
      quantity: 2,
      unitPrice: 45,
      lineTotal: 90,
      fulfillment: "DINE_IN",
      notes: null,
      preparationAreaId: "66666666-6666-4666-8666-666666666666",
      stationCode: "WOK",
    },
  ],
  tickets: [
    {
      id: "77777777-7777-4777-8777-777777777777",
      sequence: 1,
      status: "READY",
      claimedBy: null,
      readyAt: "2026-10-04T12:10:00Z",
      estimatedReadyAt: "2026-10-04T12:15:00Z",
      rowVersion: 2,
      stationId: "66666666-6666-4666-8666-666666666666",
      stationCode: "WOK",
    },
  ],
};

describe("operational order live contract", () => {
  it("accepts summaries and complete details", () => {
    expect(isOperationalOrderSummaries([summary])).toBe(true);
    expect(isOperationalOrderDetails(details)).toBe(true);
  });

  it("rejects malformed monetary and line values", () => {
    expect(isOperationalOrderSummaries([{ ...summary, total: -1 }])).toBe(
      false,
    );
    expect(
      isOperationalOrderDetails({
        ...details,
        items: [{ ...details.items[0], quantity: 0 }],
      }),
    ).toBe(false);
  });

  it("normalizes valid transitions and rejects invalid versions", () => {
    expect(
      parseOperationalOrderStatus({
        status: "CANCELLED",
        expectedVersion: 3,
        reason: "  Solicitud del cliente  ",
      }),
    ).toEqual({
      status: "CANCELLED",
      expectedVersion: 3,
      reason: "Solicitud del cliente",
    });
    expect(
      parseOperationalOrderStatus({ status: "SERVED", expectedVersion: 0 }),
    ).toBeNull();
  });

  it("normalizes a valid order creation payload", () => {
    expect(
      parseCreateOperationalOrder({
        accountId: summary.accountId,
        channel: "DINE_IN",
        guestCount: 2,
        items: [
          {
            menuItemId: "55555555-5555-4555-8555-555555555555",
            quantity: 1,
            fulfillment: "DINE_IN",
            notes: "  Sin cebolla  ",
          },
        ],
      }),
    ).toEqual({
      accountId: summary.accountId,
      channel: "DINE_IN",
      guestCount: 2,
      items: [
        {
          menuItemId: "55555555-5555-4555-8555-555555555555",
          quantity: 1,
          fulfillment: "DINE_IN",
          notes: "Sin cebolla",
        },
      ],
    });
  });

  it("accepts only valid additional order items", () => {
    expect(
      parseAddOperationalOrderItems({
        items: [
          {
            menuItemId: "55555555-5555-4555-8555-555555555555",
            quantity: 1,
            fulfillment: "TAKEAWAY",
          },
        ],
      }),
    ).toEqual({
      items: [
        {
          menuItemId: "55555555-5555-4555-8555-555555555555",
          quantity: 1,
          fulfillment: "TAKEAWAY",
        },
      ],
    });
    expect(parseAddOperationalOrderItems({ items: [] })).toBeNull();
  });
});
