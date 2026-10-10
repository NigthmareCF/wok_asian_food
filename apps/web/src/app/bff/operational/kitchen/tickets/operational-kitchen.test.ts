// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";
import { POST as claim } from "./[ticketId]/claim/route";
import { PATCH as changeStatus } from "./[ticketId]/status/route";

const auth = vi.hoisted(() => ({
  readAccessToken: vi.fn(),
  loadCurrentUser: vi.fn(),
}));
vi.mock("@/modules/auth/server/auth-cookies", () => auth);
vi.mock("@/modules/auth/server/backend-auth", async (original) => ({
  ...(await original<typeof import("@/modules/auth/server/backend-auth")>()),
  loadCurrentUser: auth.loadCurrentUser,
}));

const ticketId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const ticket = {
  id: ticketId,
  orderId: "33333333-3333-4333-8333-333333333333",
  orderCode: "ORD-1001",
  sequence: 1,
  status: "QUEUED",
  rowVersion: 1,
  stationId: "44444444-4444-4444-8444-444444444444",
  stationCode: "WOK",
  claimedBy: null,
  claimedAt: null,
  readyAt: null,
  estimatedReadyAt: "2026-10-04T12:15:00Z",
  channel: "DINE_IN",
  diningTableName: "Mesa 4",
  accountName: "Cuenta principal",
  itemCount: 1,
  totalQuantity: 1,
  oldestItemAt: "2026-10-04T12:00:00Z",
  items: [
    {
      orderItemId: "55555555-5555-4555-8555-555555555555",
      name: "Wok de pollo",
      quantity: 1,
      action: "NEW",
      fulfillment: "DINE_IN",
      notes: null,
    },
  ],
};

function request(method: "GET" | "POST" | "PATCH", url = "", body?: unknown) {
  return new NextRequest(
    `http://localhost/bff/operational/kitchen/tickets${url}`,
    {
      method,
      headers: {
        origin: "http://localhost",
        "X-Wok-Expected-Principal": "40000000-0000-4000-8000-000000000001",
        host: "localhost",
        ...(method !== "GET" ? { "X-Request-Id": requestId } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
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

it("forwards the authenticated kitchen queue and supported filters", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json([ticket]));

  const response = await GET(
    request("GET", "?status=READY&stationId=station&ignored=x"),
  );

  expect(response.status).toBe(200);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining(
      "/api/v1/operational/kitchen/tickets?status=READY&stationId=station",
    ),
    expect.objectContaining({
      method: "GET",
      headers: expect.objectContaining({ Authorization: "Bearer staff-token" }),
    }),
  );
});

it("requires a session before listing the kitchen queue", async () => {
  auth.readAccessToken.mockResolvedValue(null);
  expect((await GET(request("GET"))).status).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
});

it("forwards claim with the request identifier", async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json({ ...ticket, status: "PREPARING", rowVersion: 2 }),
  );

  const response = await claim(request("POST"), {
    params: Promise.resolve({ ticketId }),
  });

  expect(response.status).toBe(200);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining(`/tickets/${ticketId}/claim`),
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "X-Request-Id": requestId }),
    }),
  );
});

it("validates and forwards a status transition", async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json({ ...ticket, status: "READY", rowVersion: 2 }),
  );

  const response = await changeStatus(
    request("PATCH", "", { status: "READY", expectedVersion: 1 }),
    { params: Promise.resolve({ ticketId }) },
  );

  expect(response.status).toBe(200);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining(`/tickets/${ticketId}/status`),
    expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ status: "READY", expectedVersion: 1 }),
      headers: expect.objectContaining({ "X-Request-Id": requestId }),
    }),
  );
});

it("rejects malformed transitions before calling the API", async () => {
  const response = await changeStatus(
    request("PATCH", "", { status: "READY", expectedVersion: 0 }),
    { params: Promise.resolve({ ticketId }) },
  );

  expect(response.status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});
