// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET as list, POST as create } from "./route";
import { GET as details } from "./[orderId]/route";
import { POST as addItems } from "./[orderId]/items/route";
import { PATCH as changeStatus } from "./[orderId]/status/route";

const auth = vi.hoisted(() => ({
  readAccessToken: vi.fn(),
  loadCurrentUser: vi.fn(),
}));
vi.mock("@/modules/auth/server/auth-cookies", () => auth);
vi.mock("@/modules/auth/server/backend-auth", async (original) => ({
  ...(await original<typeof import("@/modules/auth/server/backend-auth")>()),
  loadCurrentUser: auth.loadCurrentUser,
}));

const orderId = "11111111-1111-4111-8111-111111111111";
const tableId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const idempotencyKey = "88888888-8888-4888-8888-888888888888";
const summary = {
  id: orderId,
  code: "ORD-20261004-0001",
  status: "READY",
  channel: "DINE_IN",
  subtotal: 45,
  discount: 0,
  total: 45,
  guestCount: 2,
  openedAt: "2026-10-04T12:00:00Z",
  closedAt: null,
  rowVersion: 2,
  currencyId: "44444444-4444-4444-8444-444444444444",
  currency: "GTQ",
  diningTableId: tableId,
  diningTableName: "Mesa 4",
  accountId: "55555555-5555-4555-8555-555555555555",
  accountName: "Cuenta principal",
  itemCount: 1,
};
const detail = {
  order: summary,
  items: [
    {
      id: "66666666-6666-4666-8666-666666666666",
      name: "Wok de pollo",
      quantity: 1,
      unitPrice: 45,
      lineTotal: 45,
      fulfillment: "DINE_IN",
      notes: null,
      preparationAreaId: "77777777-7777-4777-8777-777777777777",
      stationCode: "WOK",
    },
  ],
  tickets: [],
};

function request(method: "GET" | "POST" | "PATCH", url = "", body?: unknown) {
  return new NextRequest(`http://localhost/bff/operational/orders${url}`, {
    method,
    headers: {
      origin: "http://localhost",
      "X-Wok-Expected-Principal": "40000000-0000-4000-8000-000000000001",
      host: "localhost",
      ...(method !== "GET" ? { "X-Request-Id": requestId } : {}),
      ...(method === "POST" ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  auth.loadCurrentUser.mockResolvedValue({
    userId: "40000000-0000-4000-8000-000000000001",
    email: "staff@wok.test",
    displayName: "Staff fixture",
    status: "ACTIVE",
    roles: ["OPERATIONAL"],
    permissions: [],
  });
  auth.readAccessToken.mockResolvedValue("staff-token");
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("forwards list filters and the authenticated session", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json([summary]));
  const response = await list(
    request("GET", `?status=READY&tableId=${tableId}&ignored=x`),
  );
  expect(response.status).toBe(200);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining(
      `/api/v1/operational/orders?status=READY&tableId=${tableId}`,
    ),
    expect.objectContaining({
      method: "GET",
      headers: expect.objectContaining({ Authorization: "Bearer staff-token" }),
    }),
  );
});

it("requires a session before listing orders", async () => {
  auth.readAccessToken.mockResolvedValue(null);
  expect((await list(request("GET"))).status).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
});

it("forwards a valid detail request", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json(detail));
  const response = await details(request("GET"), {
    params: Promise.resolve({ orderId }),
  });
  expect(response.status).toBe(200);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining(`/api/v1/operational/orders/${orderId}`),
    expect.objectContaining({ method: "GET" }),
  );
});

it("validates and forwards a status transition", async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json({ ...summary, status: "SERVED", rowVersion: 3 }),
  );
  const response = await changeStatus(
    request("PATCH", "", { status: "SERVED", expectedVersion: 2 }),
    { params: Promise.resolve({ orderId }) },
  );
  expect(response.status).toBe(200);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining(`/api/v1/operational/orders/${orderId}/status`),
    expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ status: "SERVED", expectedVersion: 2 }),
      headers: expect.objectContaining({ "X-Request-Id": requestId }),
    }),
  );
});

it("validates and forwards an idempotent order creation", async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json(
      {
        orderId,
        code: summary.code,
        status: "SENT",
        channel: "DINE_IN",
        subtotal: 45,
        discount: 0,
        total: 45,
        currency: "GTQ",
        rowVersion: 1,
        itemCount: 1,
        idempotentReplay: false,
      },
      { status: 201 },
    ),
  );
  const response = await create(
    request("POST", "", {
      accountId: summary.accountId,
      channel: "DINE_IN",
      guestCount: 2,
      items: [
        {
          menuItemId: detail.items[0].id,
          quantity: 1,
          fulfillment: "DINE_IN",
        },
      ],
    }),
  );
  expect(response.status).toBe(201);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/v1/operational/orders"),
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        "Idempotency-Key": idempotencyKey,
        "X-Request-Id": requestId,
      }),
    }),
  );
});

it("forwards additional items only with idempotency protection", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json(detail));
  const response = await addItems(
    request("POST", "", {
      items: [
        {
          menuItemId: detail.items[0].id,
          quantity: 1,
          fulfillment: "TAKEAWAY",
        },
      ],
    }),
    { params: Promise.resolve({ orderId }) },
  );
  expect(response.status).toBe(200);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining(`/api/v1/operational/orders/${orderId}/items`),
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "Idempotency-Key": idempotencyKey }),
    }),
  );
});

it("rejects malformed status changes before calling the API", async () => {
  const response = await changeStatus(
    request("PATCH", "", { status: "SERVED", expectedVersion: 0 }),
    { params: Promise.resolve({ orderId }) },
  );
  expect(response.status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});
