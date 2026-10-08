// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";
import { POST } from "./[requestId]/decision/route";

const auth = vi.hoisted(() => ({
  readAccessToken: vi.fn(),
  loadCurrentUser: vi.fn(),
}));
vi.mock("@/modules/auth/server/auth-cookies", () => auth);
vi.mock("@/modules/auth/server/backend-auth", async (original) => ({
  ...(await original<typeof import("@/modules/auth/server/backend-auth")>()),
  loadCurrentUser: auth.loadCurrentUser,
}));

const requestId = "11111111-1111-4111-8111-111111111111";
const summary = {
  requestId,
  status: "PENDING_REVIEW",
  fulfillmentType: "PICKUP",
  requestedFor: "2026-10-05T01:00:00Z",
  submittedAt: "2026-10-05T00:30:00Z",
  customerName: "Cliente",
  customerEmail: "cliente@example.test",
  customerNote: null,
  subtotal: 68,
  currency: "GTQ",
  orderId: null,
  orderStatus: null,
  items: [{ name: "Gyozas", quantity: 1, unitPrice: 68, lineTotal: 68 }],
};

beforeEach(() => {
  auth.loadCurrentUser.mockResolvedValue({
    userId: "40000000-0000-4000-8000-000000000001",
    email: "staff@wok.test",
    displayName: "Staff fixture",
    status: "ACTIVE",
    roles: ["OPERATIONAL"],
    permissions: [],
  });
  auth.readAccessToken.mockResolvedValue("operator-token");
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("forwards the selected queue status", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json([summary]));
  const response = await GET(
    new NextRequest(
      "http://localhost/bff/operational/order-requests?status=PENDING_REVIEW",
      {
        headers: {
          "X-Wok-Expected-Principal": "40000000-0000-4000-8000-000000000001",
        },
      },
    ),
  );
  expect(response.status).toBe(200);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining(
      "/api/v1/operational/order-requests?status=PENDING_REVIEW",
    ),
    expect.objectContaining({ method: "GET" }),
  );
});

it("requires a rejection reason before forwarding a decision", async () => {
  const response = await POST(
    new NextRequest(
      `http://localhost/bff/operational/order-requests/${requestId}/decision`,
      {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "X-Wok-Expected-Principal": "40000000-0000-4000-8000-000000000001",
          host: "localhost",
          "X-Request-Id": crypto.randomUUID(),
        },
        body: JSON.stringify({ action: "REJECT" }),
      },
    ),
    { params: Promise.resolve({ requestId }) },
  );
  expect(response.status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});

it("forwards a valid acceptance with the authenticated session", async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json({
      requestId,
      status: "ACCEPTED",
      orderId: crypto.randomUUID(),
      idempotentReplay: false,
    }),
  );
  const response = await POST(
    new NextRequest(
      `http://localhost/bff/operational/order-requests/${requestId}/decision`,
      {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "X-Wok-Expected-Principal": "40000000-0000-4000-8000-000000000001",
          host: "localhost",
          "X-Request-Id": crypto.randomUUID(),
        },
        body: JSON.stringify({ action: "ACCEPT" }),
      },
    ),
    { params: Promise.resolve({ requestId }) },
  );
  expect(response.status).toBe(200);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining(
      `/api/v1/operational/order-requests/${requestId}/decision`,
    ),
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer operator-token",
      }),
    }),
  );
});
