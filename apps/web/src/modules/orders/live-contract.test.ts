import { afterEach, expect, it, vi } from "vitest";
import {
  testCreate,
  testDetails,
  testId,
  testOrder,
  testReceipt,
  testTicket,
  testLoad,
} from "@/data/fixtures/operational-api-test";
import {
  isOrderSummary,
  isOrderDetails,
  isOrderReceipt,
  parseCreateOrder,
  parseOrderStatus,
} from "./live-contract";
import {
  isKitchenTicket,
  isStationLoads,
  parseTicketStatus,
} from "@/modules/kitchen/live-contract";
import { orderAttempt } from "./create-attempt";
import { mergeKitchenTickets } from "@/modules/kitchen/live-mapping";
import {
  orderLabels,
  orderTransitions,
  ticketLabels,
  ticketLines,
  ticketTransitions,
} from "./live-mapping";
afterEach(() => vi.unstubAllGlobals());
it("deduplicates tickets observed during a queue transition by rowVersion", () => {
  const ready = { ...testTicket, status: "READY" as const, rowVersion: 3 };
  expect(mergeKitchenTickets([testTicket], [ready])).toEqual([ready]);
  expect(mergeKitchenTickets([ready], [testTicket])).toEqual([ready]);
});
it("accepts real DTOs including omitted nullable fields", () => {
  expect(isOrderSummary(testOrder)).toBe(true);
  expect(isOrderDetails(testDetails)).toBe(true);
  expect(isOrderReceipt(testReceipt)).toBe(true);
  expect(isKitchenTicket(testTicket)).toBe(true);
  expect(isStationLoads([testLoad])).toBe(true);
});
it.each([
  { rowVersion: 0 },
  { total: "85" },
  { total: NaN },
  { status: "delayed" },
  { accountId: "account-1" },
  { openedAt: "ayer" },
])("rejects invalid order fields %j", (patch) =>
  expect(isOrderSummary({ ...testOrder, ...patch })).toBe(false),
);
it("rejects malformed nested lines, tickets and loads", () => {
  expect(parseCreateOrder({ ...testCreate, channel: ["DINE_IN"] })).toBeNull();
  expect(
    parseCreateOrder({
      ...testCreate,
      items: [{ ...testCreate.items[0], fulfillment: ["DINE_IN"] }],
    }),
  ).toBeNull();
  expect(
    isOrderDetails({
      ...testDetails,
      items: [{ ...testDetails.items[0], quantity: -1 }],
    }),
  ).toBe(false);
  expect(isKitchenTicket({ ...testTicket, claimedBy: "Antony" })).toBe(false);
  expect(isStationLoads([{ ...testLoad, queued: -1 }])).toBe(false);
});
it("whitelists creation and never forwards prices or totals", () => {
  expect(
    parseCreateOrder({
      ...testCreate,
      total: 1,
      items: [{ ...testCreate.items[0], unitPrice: 1, modifiers: ["extra"] }],
    }),
  ).toEqual(testCreate);
});
it.each([
  { accountId: "" },
  { guestCount: 0 },
  { channel: "table" },
  { items: [] },
  { items: [testCreate.items[0], testCreate.items[0]] },
  { items: [{ ...testCreate.items[0], fulfillment: "BARRIL" }] },
  { items: [{ ...testCreate.items[0], quantity: 1.5 }] },
])("rejects unsupported creation %j", (patch) =>
  expect(parseCreateOrder({ ...testCreate, ...patch })).toBeNull(),
);
it("validates status versions and separates ticket from order states", () => {
  expect(
    parseOrderStatus({ status: "READY", expectedVersion: 2, total: 1 }),
  ).toEqual({ status: "READY", expectedVersion: 2 });
  expect(parseOrderStatus({ status: "READY", expectedVersion: 0 })).toBeNull();
  expect(
    parseTicketStatus({ status: "SERVED", expectedVersion: 1 }),
  ).toBeNull();
  expect(parseTicketStatus({ status: "RECALLED", expectedVersion: 3 })).toEqual(
    { status: "RECALLED", expectedVersion: 3 },
  );
});
it("retains an identical retry key but changes it for account, line notes or content", () => {
  let sequence = 20;
  vi.stubGlobal("crypto", { randomUUID: () => testId(sequence++) });
  const first = orderAttempt(testCreate, null);
  expect(orderAttempt(structuredClone(testCreate), first)).toBe(first);
  for (const payload of [
    { ...testCreate, accountId: testId(50) },
    { ...testCreate, notes: "Nueva nota" },
    { ...testCreate, items: [{ ...testCreate.items[0], notes: "Con sal" }] },
    { ...testCreate, items: [{ ...testCreate.items[0], quantity: 3 }] },
  ])
    expect(orderAttempt(payload, first).key).not.toBe(first.key);
});
it("maps backend states and station items without fixture product IDs", () => {
  expect(orderLabels.READY).toBe("Listo");
  expect(ticketLabels.QUEUED).toBe("En cola");
  expect(orderTransitions.SENT).not.toContain("READY");
  expect(ticketTransitions.PREPARING).toContain("READY");
  expect(
    ticketLines(
      {
        ...testDetails,
        items: [
          ...testDetails.items,
          {
            ...testDetails.items[0],
            id: testId(21),
            preparationAreaId: testId(22),
          },
        ],
      },
      testTicket,
    ),
  ).toEqual(testDetails.items);
});
