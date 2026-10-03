// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
const auth = vi.hoisted(() => ({ readAccessToken: vi.fn() }));
vi.mock("@/modules/auth/server/auth-cookies", () => auth);
const id = "11111111-1111-4111-8111-111111111111";
const payload = {
  requestedFor: "2026-12-10T18:00:00Z",
  customerNote: " prueba ",
  items: [{ menuItemId: id, quantity: 2 }],
  subtotal: 0.01,
};
const receipt = {
  requestId: id,
  status: "PENDING_REVIEW",
  requestedFor: payload.requestedFor,
  subtotal: 136,
  currency: "GTQ",
  idempotentReplay: false,
};
function request(body: unknown = payload, origin = "http://localhost") {
  return new NextRequest("http://localhost/bff/order-requests", {
    method: "POST",
    headers: { origin, host: "localhost", "Idempotency-Key": id },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  auth.readAccessToken.mockResolvedValue("server-cookie-token");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json(receipt, { status: 202 })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("pickup BFF", () => {
  it.each(["https://attacker.example", ""])(
    "rejects foreign or missing origins",
    async (origin) => {
      expect((await POST(request(payload, origin))).status).toBe(403);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("requires a session cookie", async () => {
    auth.readAccessToken.mockResolvedValue(undefined);
    expect((await POST(request())).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(
    [
      [],
      [{ menuItemId: id, quantity: 51 }],
      [{ menuItemId: "fixture", quantity: 1 }],
      [
        { menuItemId: id, quantity: 1 },
        { menuItemId: id, quantity: 2 },
      ],
    ].map((items) => ({ items })),
  )("rejects invalid lines before sending", async ({ items }) => {
    expect((await POST(request({ ...payload, items }))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("sends only permitted fields, the cookie token and the idempotency key", async () => {
    vi.stubEnv("WOK_API_BASE_URL", "http://api:8080");
    const response = await POST(request());
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(receipt);
    expect(fetch).toHaveBeenCalledWith(
      "http://api:8080/api/v1/client/order-requests",
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer server-cookie-token",
          "Idempotency-Key": id,
        },
        body: JSON.stringify({
          requestedFor: payload.requestedFor,
          customerNote: "prueba",
          items: payload.items,
        }),
      }),
    );
  });
  it.each([401, 403, 409, 422, 500])(
    "handles backend status %s without exposing raw diagnostics",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(new Response("private diagnostics", { status })),
      );
      const response = await POST(request());
      expect(response.status).toBe(status === 500 ? 503 : status);
      expect(await response.text()).not.toContain("private diagnostics");
    },
  );
  it("reports uncertain network outcomes without issuing another POST", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    expect((await POST(request())).status).toBe(503);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
