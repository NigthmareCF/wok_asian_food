// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET as kitchen } from "./kitchen/load/route";
import { GET as orders } from "./orders/route";
import { GET as services } from "../service-capabilities/route";
const auth = vi.hoisted(() => ({
  readAccessToken: vi.fn(),
  loadCurrentUser: vi.fn(),
}));
vi.mock("@/modules/auth/server/backend-auth", async (original) => ({
  ...(await original<typeof import("@/modules/auth/server/backend-auth")>()),
  loadCurrentUser: auth.loadCurrentUser,
}));
vi.mock("@/modules/auth/server/auth-cookies", () => auth);
const request = () =>
  new NextRequest("http://localhost/bff/operational/orders?path=admin/users", {
    headers: {
      "X-Wok-Expected-Principal": "40000000-0000-4000-8000-000000000001",
    },
  });
beforeEach(() => {
  auth.readAccessToken.mockResolvedValue("private-token");
  auth.loadCurrentUser.mockResolvedValue({
    userId: "40000000-0000-4000-8000-000000000001",
    email: "staff@wok.test",
    displayName: "Staff",
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
it.each([
  [kitchen, "kitchen/load"],
  [orders, "orders"],
] as const)(
  "forwards authenticated reads to fixed existing endpoints",
  async (handler, path) => {
    vi.mocked(fetch).mockResolvedValue(Response.json([]));
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual([]);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/operational/" + path),
      expect.objectContaining({
        cache: "no-store",
        headers: { Authorization: "Bearer private-token" },
      }),
    );
    expect(String(vi.mocked(fetch).mock.calls[0][0])).not.toContain(
      "admin/users",
    );
  },
);
it.each([kitchen, orders])(
  "rejects anonymous calls without contacting upstream",
  async (handler) => {
    auth.readAccessToken.mockResolvedValue(null);
    expect((await handler(request())).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  },
);
it.each([401, 403, 500])(
  "preserves authentication errors and sanitizes upstream failures (%i)",
  async (status) => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ secret: "internal" }, { status }),
    );
    const response = await kitchen(request());
    expect(response.status).toBe(status === 500 ? 503 : status);
    expect(await response.text()).not.toContain("internal");
  },
);
it.each([kitchen, orders])(
  "rejects malformed DTOs and network failures",
  async (handler) => {
    vi.mocked(fetch).mockResolvedValue(Response.json([{ id: "fake" }]));
    expect((await handler(request())).status).toBe(503);
    vi.mocked(fetch).mockRejectedValue(new Error("timeout"));
    expect((await handler(request())).status).toBe(503);
  },
);
it("returns persisted public capabilities without credentials or inferred opening hours", async () => {
  const body = [{ code: "LOCAL", status: "PAUSED" }];
  vi.mocked(fetch).mockResolvedValue(Response.json(body));
  const response = await services();
  expect(await response.json()).toEqual(body);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/v1/public/service-capabilities"),
    expect.objectContaining({ cache: "no-store" }),
  );
  expect(auth.readAccessToken).not.toHaveBeenCalled();
});
it("rejects malformed or unavailable public policy without a fallback", async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json([{ code: "LOCAL", status: "UNKNOWN" }]),
  );
  expect((await services()).status).toBe(503);
  vi.mocked(fetch).mockRejectedValue(new Error("offline"));
  expect((await services()).status).toBe(503);
});
