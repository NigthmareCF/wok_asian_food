import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { PUT } from "./[code]/route";

const backend = vi.hoisted(() => ({
  fetchWithWokSession: vi.fn(),
  sameOriginMutation: vi.fn(),
}));
vi.mock("@/shared/server/wok-backend", () => backend);

afterEach(() => vi.clearAllMocks());

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Admin service capability BFF", () => {
  it("proxies the no-cache authenticated list", async () => {
    backend.fetchWithWokSession.mockResolvedValueOnce(jsonResponse([{ code: "PICKUP" }]));
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(backend.fetchWithWokSession).toHaveBeenCalledWith(
      "/api/v1/admin/service-capabilities",
    );
  });

  it("rejects cross-origin writes and malformed payloads before backend calls", async () => {
    const crossOrigin = new NextRequest("https://wok.test/api/admin/service-capabilities/PICKUP", {
      method: "PUT",
      headers: { origin: "https://attacker.test", "sec-fetch-site": "cross-site" },
      body: JSON.stringify({ status: "PAUSED", reason: "load", expectedVersion: 1 }),
    });
    backend.sameOriginMutation.mockReturnValueOnce(false);
    expect((await PUT(crossOrigin, { params: Promise.resolve({ code: "PICKUP" }) })).status).toBe(403);

    const invalid = new NextRequest("https://wok.test/api/admin/service-capabilities/PICKUP", {
      method: "PUT",
      headers: { origin: "https://wok.test", "sec-fetch-site": "same-origin" },
      body: JSON.stringify({ status: "PAUSED", reason: "x", expectedVersion: 0 }),
    });
    backend.sameOriginMutation.mockReturnValueOnce(true);
    expect((await PUT(invalid, { params: Promise.resolve({ code: "PICKUP" }) })).status).toBe(400);
    expect(backend.fetchWithWokSession).not.toHaveBeenCalled();
  });

  it("forwards only the validated reason, version and status", async () => {
    const request = new NextRequest("https://wok.test/api/admin/service-capabilities/PICKUP", {
      method: "PUT",
      headers: { origin: "https://wok.test", "sec-fetch-site": "same-origin" },
      body: JSON.stringify({ status: "PAUSED", reason: "  Alta carga  ", expectedVersion: 7, extra: "discard" }),
    });
    backend.sameOriginMutation.mockReturnValueOnce(true);
    backend.fetchWithWokSession.mockResolvedValueOnce(jsonResponse({ code: "PICKUP", status: "PAUSED" }));

    expect((await PUT(request, { params: Promise.resolve({ code: "PICKUP" }) })).status).toBe(200);
    const [path, init] = backend.fetchWithWokSession.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/v1/admin/service-capabilities/PICKUP");
    expect(JSON.parse(String(init.body))).toEqual({ status: "PAUSED", reason: "Alta carga", expectedVersion: 7 });
    expect(init.headers).toEqual({ "X-Request-Id": expect.any(String) });
  });
});
