// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as history } from "./route";
import { GET as detail, DELETE as cancel } from "./[requestId]/route";
const auth = vi.hoisted(() => ({ readAccessToken: vi.fn() }));
vi.mock("@/modules/auth/server/auth-cookies", () => auth);
const id = "11111111-1111-4111-8111-111111111111";
const receipt = {
  requestId: id,
  status: "PENDING_REVIEW",
  requestedFor: "2026-10-03T18:00:00Z",
  subtotal: 68,
  currency: "GTQ",
  idempotentReplay: false,
};
const details = {
  ...receipt,
  customerNote: "Prueba",
  items: [
    {
      name: "Gyozas",
      quantity: 1,
      unitPrice: 68,
      lineTotal: 68,
      currencyId: id,
    },
  ],
};
const context = { params: Promise.resolve({ requestId: id }) };
const request = (origin = "http://localhost") =>
  new NextRequest(`http://localhost/bff/order-requests/${id}`, {
    headers: { host: "localhost", origin, "X-Wok-Expected-Principal": id },
  });
beforeEach(() => {
  auth.readAccessToken.mockResolvedValue("cookie-token");
  vi.stubEnv("WOK_API_BASE_URL", "http://api:8080");
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("pickup history and cancellation BFF", () => {
  it.each(["history", "detail", "cancel"])(
    "rejects an absent principal header with update-required for %s",
    async (operation) => {
      const req = request();
      req.headers.delete("X-Wok-Expected-Principal");
      vi.stubGlobal("fetch", vi.fn());
      const response =
        operation === "history"
          ? await history(req)
          : operation === "detail"
            ? await detail(req, context)
            : await cancel(req, context);
      expect(response.status).toBe(409);
      expect((await response.json()).code).toBe("CLIENT_UPDATE_REQUIRED");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("keeps invalid resource identifiers as 404 even without a principal header", async () => {
    const req = request();
    req.headers.delete("X-Wok-Expected-Principal");
    vi.stubGlobal("fetch", vi.fn());
    const response = await detail(req, {
      params: Promise.resolve({ requestId: "../../admin" }),
    });
    expect(response.status).toBe(404);
    expect((await response.json()).code).not.toBe("CLIENT_UPDATE_REQUIRED");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("reads private history without caching and uses server credentials", async () => {
    installFetch(vi.fn().mockResolvedValue(Response.json([receipt])));
    const response = await history(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual([receipt]);
    expect(fetch).toHaveBeenCalledWith(
      "http://api:8080/api/v1/client/order-requests",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer cookie-token",
        },
      }),
    );
  });
  it("reads actual detail lines and forwards cancellation", async () => {
    installFetch(
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(details))
        .mockResolvedValueOnce(
          Response.json({ requestId: id, status: "CANCELLED" }),
        ),
    );
    expect(await (await detail(request(), context)).json()).toEqual(details);
    expect(await (await cancel(request(), context)).json()).toEqual({
      requestId: id,
      status: "CANCELLED",
    });
    expect(fetch).toHaveBeenLastCalledWith(
      `http://api:8080/api/v1/client/order-requests/${id}`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });
  it("rejects unauthenticated access to all operations", async () => {
    auth.readAccessToken.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn());
    expect((await history(request())).status).toBe(401);
    expect((await detail(request(), context)).status).toBe(401);
    expect((await cancel(request(), context)).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["", "https://foreign.example"])(
    "blocks cancellation from a missing or foreign origin",
    async (origin) => {
      vi.stubGlobal("fetch", vi.fn());
      expect((await cancel(request(origin), context)).status).toBe(403);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("rejects invalid identifiers before contacting the API", async () => {
    vi.stubGlobal("fetch", vi.fn());
    expect(
      (
        await detail(request(), {
          params: Promise.resolve({ requestId: "../../admin" }),
        })
      ).status,
    ).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([401, 403, 404, 409, 500])(
    "preserves expected errors and hides backend diagnostics (%s)",
    async (status) => {
      installFetch(
        vi.fn().mockResolvedValue(new Response("private error", { status })),
      );
      const response = await cancel(request(), context);
      expect(response.status).toBe(status === 500 ? 503 : status);
      expect(await response.text()).not.toContain("private error");
    },
  );
  it("rejects a mismatched response id", async () => {
    installFetch(
      vi.fn().mockResolvedValue(
        Response.json({
          ...details,
          requestId: "22222222-2222-4222-8222-222222222222",
        }),
      ),
    );
    expect((await detail(request(), context)).status).toBe(503);
  });
  it("does not treat malformed or lost responses as cancellation success", async () => {
    installFetch(
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ status: "PENDING_REVIEW" }))
        .mockRejectedValueOnce(new Error("network")),
    );
    expect((await cancel(request(), context)).status).toBe(503);
    expect((await cancel(request(), context)).status).toBe(503);
  });
});

function installFetch(domainFetch: typeof fetch) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: RequestInfo | URL, init?: RequestInit) =>
      new URL(String(url)).pathname === "/api/v1/auth/me"
        ? Promise.resolve(
            Response.json({
              userId: id,
              email: "client@mock.invalid",
              displayName: "MOCK_ONLY Client",
              status: "ACTIVE",
              roles: ["CLIENT"],
              permissions: [],
            }),
          )
        : domainFetch(url, init),
    ),
  );
}
