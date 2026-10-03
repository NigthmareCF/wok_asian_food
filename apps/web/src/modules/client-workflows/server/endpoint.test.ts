// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import {
  POST as delivery,
  GET as deliveryHistory,
} from "@/app/bff/delivery-requests/route";
import { GET as deliveryDetail } from "@/app/bff/delivery-requests/[requestId]/route";
import { POST as reserve } from "@/app/bff/reservations/route";
import { DELETE as cancel } from "@/app/bff/reservations/[reservationId]/route";
import { messagingEndpoint } from "@/modules/messaging/server/live-endpoint";
const auth = vi.hoisted(() => ({ readAccessToken: vi.fn() }));
vi.mock("@/modules/auth/server/auth-cookies", () => auth);
const id = "11111111-1111-4111-8111-111111111111";
function req(
  method = "POST",
  body: unknown = {},
  origin = "http://localhost",
  key = id,
) {
  return new NextRequest("http://localhost/bff/test", {
    method,
    headers: { origin, host: "localhost", "Idempotency-Key": key },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
}
const payload = {
  requestedFor: "2026-12-01T20:00:00Z",
  customerNote: "",
  items: [{ menuItemId: id, quantity: 1 }],
  address: "Dirección demo",
  reference: "",
  contactPhone: "55550000",
  paymentPreference: "CASH_ON_DELIVERY",
};
const receipt = {
  requestId: id,
  status: "PENDING_REVIEW",
  fulfillmentType: "DELIVERY",
  requestedFor: payload.requestedFor,
  subtotal: 68,
  currency: "GTQ",
  paymentPreference: "CASH_ON_DELIVERY",
  idempotentReplay: false,
  message: "Pendiente",
};
beforeEach(() => {
  auth.readAccessToken.mockResolvedValue("cookie-token");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json(receipt, { status: 202 })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it.each(["https://foreign.example", ""])(
  "blocks mutation origin %s",
  async (origin) => {
    expect((await delivery(req("POST", payload, origin))).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  },
);
it("requires a cookie", async () => {
  auth.readAccessToken.mockResolvedValue(null);
  expect((await deliveryHistory(req("GET"))).status).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
});
it("requires an idempotency key", async () => {
  expect(
    (await delivery(req("POST", payload, "http://localhost", "bad"))).status,
  ).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});
it("never forwards customer supplied totals or authorization", async () => {
  expect(
    (
      await delivery(
        req("POST", { ...payload, subtotal: 1, Authorization: "evil" }),
      )
    ).status,
  ).toBe(202);
  const options = vi.mocked(fetch).mock.calls[0][1]!;
  expect(JSON.parse(String(options.body))).toEqual(payload);
  expect(options.headers).toMatchObject({
    Authorization: "Bearer cookie-token",
    "Idempotency-Key": id,
  });
});
it.each([400, 401, 403, 404, 409, 422, 500, 503])(
  "sanitizes backend error %s",
  async (status) => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("secret diagnostics", { status }),
    );
    const result = await delivery(req("POST", payload));
    expect(result.status).toBe(status >= 500 ? 503 : status);
    expect(await result.text()).not.toContain("secret");
  },
);
it("rejects malformed upstream data", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ paid: true }));
  expect((await delivery(req("POST", payload))).status).toBe(503);
});
it("bounds dynamic identifiers", async () => {
  expect(
    (
      await deliveryDetail(req("GET"), {
        params: Promise.resolve({ requestId: "../admin" }),
      })
    ).status,
  ).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});
it("rejects cancellation without origin", async () => {
  expect(
    (
      await cancel(req("DELETE", {}, ""), {
        params: Promise.resolve({ reservationId: id }),
      })
    ).status,
  ).toBe(403);
});
it("requires the cancelled reservation to match", async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json({
      reservationId: "22222222-2222-4222-8222-222222222222",
      status: "CANCELLED",
    }),
  );
  expect(
    (
      await cancel(req("DELETE"), {
        params: Promise.resolve({ reservationId: id }),
      })
    ).status,
  ).toBe(503);
});
it("does not invent preorders", async () => {
  expect(
    (
      await reserve(
        req("POST", {
          guests: 2,
          requestedAt: payload.requestedFor,
          notes: "",
          preorder: true,
        }),
      )
    ).status,
  ).toBe(400);
});
it.each(["admin", "../client", "https://evil"])(
  "rejects unlisted messaging scope %s",
  async (scope) => {
    expect((await messagingEndpoint(req("GET"), scope)).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  },
);
it("does not open staff conversations", async () => {
  expect((await messagingEndpoint(req(), "operational")).status).toBe(405);
  expect(fetch).not.toHaveBeenCalled();
});
it("validates message text", async () => {
  expect(
    (
      await messagingEndpoint(req("POST", { body: "  " }), "client", [
        id,
        "messages",
      ])
    ).status,
  ).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});
it("routes staff replies only to the operational API", async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json({
      messageId: id,
      status: "SENT",
      createdAt: payload.requestedFor,
      idempotentReplay: false,
    }),
  );
  expect(
    (
      await messagingEndpoint(
        req("POST", { body: " Respuesta " }),
        "operational",
        [id, "messages"],
      )
    ).status,
  ).toBe(200);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining(`/api/v1/operational/conversations/${id}/messages`),
    expect.objectContaining({ body: JSON.stringify({ body: "Respuesta" }) }),
  );
});
