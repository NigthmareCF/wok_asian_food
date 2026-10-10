// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET as current } from "@/app/bff/order-requests/[requestId]/change-requests/route";
import { GET as inbox } from "@/app/bff/operational/order-requests/route";
import { PATCH as decide } from "@/app/bff/operational/order-change-requests/[changeId]/route";
const auth = vi.hoisted(() => ({ readAccessToken: vi.fn() }));
const principal = vi.hoisted(() => ({ loadCurrentUser: vi.fn() }));
vi.mock("@/modules/auth/server/auth-cookies", () => auth);
vi.mock("@/modules/auth/server/backend-auth", async (original) => ({
  ...(await original<typeof import("@/modules/auth/server/backend-auth")>()),
  ...principal,
}));
const id = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const receipt = {
  id: other,
  orderRequestId: id,
  orderCode: "WOK-TEST",
  requestType: "CANCEL_ORDER",
  status: "PENDING_REVIEW",
  reason: "Cambio de horario",
  expectedOrderVersion: 1,
  version: 1,
  requestedAt: "2026-10-10T00:15:00Z",
};
const delivery = {
  requestId: id,
  status: "PENDING_REVIEW",
  fulfillmentType: "DELIVERY",
  requestedFor: "2026-10-10T00:15:00Z",
  submittedAt: "2026-10-09T23:15:00Z",
  customerName: "Cliente",
  customerEmail: "client@wok.test",
  customerNote: null,
  subtotal: 25,
  currency: "GTQ",
  orderId: null,
  orderStatus: null,
  deliveryAddress: "Dirección ficticia",
  deliveryReference: "Portón azul",
  contactPhone: "55550101",
  paymentPreference: "CASH_ON_DELIVERY",
  items: [{ name: "Wok", quantity: 1, unitPrice: 25, lineTotal: 25 }],
};
const request = (path = "/bff/test") =>
  new NextRequest(`http://localhost${path}`, {
    headers: { "X-Wok-Expected-Principal": id },
  });
const decisionRequest = (reason = "  Motivo válido  ") =>
  new NextRequest("http://localhost/bff/test", {
    method: "PATCH",
    headers: {
      origin: "http://localhost",
      host: "localhost",
      "Idempotency-Key": id,
      "X-Financial-Actor": id,
    },
    body: JSON.stringify({ decision: "REJECT", expectedVersion: 1, reason }),
  });
beforeEach(() => {
  auth.readAccessToken.mockResolvedValue("fictitious-token");
  principal.loadCurrentUser.mockResolvedValue({
    userId: id,
    displayName: "Prueba",
    email: "client@wok.test",
    status: "ACTIVE",
    roles: ["OPERATIONAL"],
    permissions: ["orders:manage"],
  });
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("F1 preserves the single delivery inbox contract and its status filter", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json([delivery]));
  const result = await inbox(
    request("/bff/operational/order-requests?status=PENDING_REVIEW"),
  );
  expect(await result.json()).toEqual([delivery]);
  expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain(
    "operational/order-requests?status=PENDING_REVIEW",
  );
});
it("F1 never exposes delivery contact fields on an unauthorized upstream response", async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json(
      { ...delivery, message: "private diagnostics" },
      { status: 403 },
    ),
  );
  const result = await inbox(request());
  expect(result.status).toBe(403);
  expect(await result.json()).toEqual({
    message: "Tu cuenta no tiene permiso para esta acción.",
  });
});
it("F1 rejects an incomplete delivery contract instead of silently hiding its contact data", async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json([{ ...delivery, contactPhone: null }]),
  );
  expect((await inbox(request())).status).toBe(503);
});
it("F2 calls current by order request without consulting a global collection", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json(receipt));
  const result = await current(request(), {
    params: Promise.resolve({ requestId: id }),
  });
  expect(await result.json()).toEqual(receipt);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain(
    `client/order-requests/${id}/change-requests/current`,
  );
});
it("F2 normalizes an absent owned cancellation but preserves other errors", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));
  const empty = await current(request(), {
    params: Promise.resolve({ requestId: id }),
  });
  expect(empty.status).toBe(200);
  expect(await empty.json()).toBeNull();
  expect(empty.headers.get("Cache-Control")).toBe("no-store");
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }));
  expect(
    (await current(request(), { params: Promise.resolve({ requestId: id }) }))
      .status,
  ).toBe(401);
});
it("F2 preserves expected identity before any upstream request", async () => {
  principal.loadCurrentUser.mockResolvedValue({
    userId: other,
    displayName: "Otro",
    email: "other@wok.test",
    status: "ACTIVE",
    roles: ["CLIENT"],
    permissions: [],
  });
  expect(
    (await current(request(), { params: Promise.resolve({ requestId: id }) }))
      .status,
  ).toBe(409);
  expect(fetch).not.toHaveBeenCalled();
});
it("F2 rejects a cancellation returned for a different order request", async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json({ ...receipt, orderRequestId: other }),
  );
  expect(
    (await current(request(), { params: Promise.resolve({ requestId: id }) }))
      .status,
  ).toBe(503);
});
it("coordination: existing BFF forwards PATCH with normalized reason, version and idempotency", async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json({
      ...receipt,
      status: "REJECTED",
      version: 2,
      decisionReason: "Motivo válido",
    }),
  );
  const result = await decide(decisionRequest(), {
    params: Promise.resolve({ changeId: other }),
  });
  expect(result.status).toBe(200);
  const options = vi.mocked(fetch).mock.calls[0][1]!;
  expect(options.method).toBe("PATCH");
  expect(JSON.parse(String(options.body))).toEqual({
    decision: "REJECT",
    expectedVersion: 1,
    reason: "Motivo válido",
  });
  expect(options.headers).toMatchObject({ "Idempotency-Key": id });
});
it("coordination: an empty successful PATCH response remains uncertain, never confirmed", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
  const result = await decide(decisionRequest(), {
    params: Promise.resolve({ changeId: other }),
  });
  expect(result.status).toBe(503);
  expect((await result.json()).message).toContain("misma solicitud");
});
it.each([" a ", "   ", "x".repeat(501)])(
  "F4 BFF rejects invalid normalized decision reason %j without writing",
  async (reason) => {
    expect(
      (
        await decide(decisionRequest(reason), {
          params: Promise.resolve({ changeId: other }),
        })
      ).status,
    ).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  },
);
