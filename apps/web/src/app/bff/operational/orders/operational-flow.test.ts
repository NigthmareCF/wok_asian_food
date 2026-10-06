// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET as list, POST as create } from "./route";
import { GET as details } from "./[orderId]/route";
import { PATCH as orderStatus } from "./[orderId]/status/route";
import { GET as tickets } from "../kitchen/tickets/route";
import { GET as load } from "../kitchen/load/route";
import { POST as claim } from "../kitchen/tickets/[ticketId]/claim/route";
import { PATCH as ticketStatus } from "../kitchen/tickets/[ticketId]/status/route";
import {
  testCreate,
  testDetails,
  testId,
  testOrder,
  testReceipt,
  testTicket,
  testLoad,
} from "@/data/fixtures/operational-api-test";
const auth = vi.hoisted(() => ({ readAccessToken: vi.fn() }));
vi.mock("@/modules/auth/server/auth-cookies", () => auth);
const orderContext = { params: Promise.resolve({ orderId: testOrder.id }) };
const ticketContext = { params: Promise.resolve({ ticketId: testTicket.id }) };
function req(
  method = "GET",
  body?: unknown,
  query = "",
  headers: Record<string, string> = {},
) {
  return new NextRequest("http://localhost/bff/test" + query, {
    method,
    headers: {
      origin: "http://localhost",
      host: "localhost",
      "X-Request-Id": testId(30),
      "Idempotency-Key": testId(31),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
beforeEach(() => {
  auth.readAccessToken.mockResolvedValue("staff-token");
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("forwards only supported list filters and authenticated requests", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json([testOrder]));
  expect(
    (
      await list(
        req(
          "GET",
          undefined,
          "?status=READY&tableId=" + testId(3) + "&ignored=secret",
        ),
      )
    ).status,
  ).toBe(200);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining(
      "/operational/orders?status=READY&tableId=" + testId(3),
    ),
    expect.objectContaining({
      cache: "no-store",
      headers: { Authorization: "Bearer staff-token" },
    }),
  );
});
it("creates with server totals and preserved idempotency and request IDs", async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json(testReceipt, { status: 201 }),
  );
  const result = await create(
    req("POST", {
      ...testCreate,
      total: 1,
      items: [{ ...testCreate.items[0], unitPrice: 1 }],
    }),
  );
  expect(result.status).toBe(201);
  expect(await result.json()).toEqual(testReceipt);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("/operational/orders"),
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify(testCreate),
      headers: expect.objectContaining({
        "Idempotency-Key": testId(31),
        "X-Request-Id": testId(30),
      }),
    }),
  );
});
it("reads details, READY tickets and load", async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(Response.json(testDetails))
    .mockResolvedValueOnce(Response.json([testTicket]))
    .mockResolvedValueOnce(Response.json([testLoad]));
  expect((await details(req(), orderContext)).status).toBe(200);
  expect(
    (
      await tickets(
        req(
          "GET",
          undefined,
          "?stationId=" + testId(6) + "&status=READY&ignored=x",
        ),
      )
    ).status,
  ).toBe(200);
  expect((await load(req())).status).toBe(200);
  expect(vi.mocked(fetch).mock.calls.map((c) => c[0])).toEqual([
    expect.stringContaining("/orders/" + testOrder.id),
    expect.stringContaining(
      "/kitchen/tickets?stationId=" + testId(6) + "&status=READY",
    ),
    expect.stringContaining("/kitchen/load"),
  ]);
});
it("forwards claim and both PATCH contracts with expectedVersion", async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(Response.json(testTicket))
    .mockResolvedValueOnce(Response.json(testTicket))
    .mockResolvedValueOnce(Response.json(testOrder));
  expect((await claim(req("POST"), ticketContext)).status).toBe(200);
  expect(
    (
      await ticketStatus(
        req("PATCH", { status: "READY", expectedVersion: 2 }),
        ticketContext,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await orderStatus(
        req("PATCH", { status: "SERVED", expectedVersion: 3 }),
        orderContext,
      )
    ).status,
  ).toBe(200);
  expect(vi.mocked(fetch).mock.calls[0][1]?.body).toBeUndefined();
  expect(vi.mocked(fetch).mock.calls[1][1]).toMatchObject({
    method: "PATCH",
    body: JSON.stringify({ status: "READY", expectedVersion: 2 }),
  });
  expect(vi.mocked(fetch).mock.calls[2][1]).toMatchObject({
    method: "PATCH",
    body: JSON.stringify({ status: "SERVED", expectedVersion: 3 }),
  });
});
it("requires authentication on all eight handlers", async () => {
  auth.readAccessToken.mockResolvedValue(null);
  const responses = await Promise.all([
    list(req()),
    create(req("POST", testCreate)),
    details(req(), orderContext),
    orderStatus(req("PATCH", {}), orderContext),
    tickets(req()),
    load(req()),
    claim(req("POST"), ticketContext),
    ticketStatus(req("PATCH", {}), ticketContext),
  ]);
  expect(responses.every((r) => r.status === 401)).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
});
it("rejects cross-origin mutations, malformed IDs, versions, filters and keys", async () => {
  expect(
    (
      await create(
        req("POST", testCreate, "", { origin: "https://foreign.test" }),
      )
    ).status,
  ).toBe(403);
  expect(
    (await claim(req("POST", undefined, "", { origin: "" }), ticketContext))
      .status,
  ).toBe(403);
  expect(
    (await create(req("POST", testCreate, "", { "Idempotency-Key": "bad" })))
      .status,
  ).toBe(400);
  expect(
    (await create(req("POST", testCreate, "", { "X-Request-Id": "bad" })))
      .status,
  ).toBe(400);
  expect(
    (
      await orderStatus(
        req("PATCH", { status: "READY", expectedVersion: 0 }),
        orderContext,
      )
    ).status,
  ).toBe(400);
  expect(
    (await details(req(), { params: Promise.resolve({ orderId: "bad" }) }))
      .status,
  ).toBe(400);
  expect(
    (
      await ticketStatus(req("PATCH", {}), {
        params: Promise.resolve({ ticketId: "bad" }),
      })
    ).status,
  ).toBe(400);
  expect((await list(req("GET", undefined, "?status=delayed"))).status).toBe(
    400,
  );
  expect((await tickets(req("GET", undefined, "?stationId=bad"))).status).toBe(
    400,
  );
  expect(fetch).not.toHaveBeenCalled();
});
it.each([400, 401, 403, 404, 409, 422, 500])(
  "sanitizes backend error %s",
  async (status) => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("internal secret", { status }),
    );
    const response = await ticketStatus(
      req("PATCH", { status: "READY", expectedVersion: 2 }),
      ticketContext,
    );
    expect(response.status).toBe(status === 500 ? 503 : status);
    expect(await response.text()).not.toContain("internal secret");
  },
);
it("rejects malformed upstream DTOs and uncertain network outcomes", async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(Response.json({ ...testDetails, items: null }))
    .mockRejectedValueOnce(new Error("network"));
  expect((await details(req(), orderContext)).status).toBe(503);
  expect((await create(req("POST", testCreate))).status).toBe(503);
});
