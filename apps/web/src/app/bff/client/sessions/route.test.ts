// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { DELETE } from "./[sessionId]/route";

const auth = vi.hoisted(() => ({ readAccessToken: vi.fn() }));
vi.mock("@/modules/auth/server/auth-cookies", () => auth);

const session = {
  sessionId: "11111111-1111-4111-8111-111111111111",
  clientType: "WEB",
  deviceName: null,
  createdAt: "2026-10-08T12:00:00Z",
  lastActivityAt: "2026-10-08T12:30:00Z",
  current: true,
};

function request(method: "GET" | "DELETE", origin = "http://localhost") {
  return new NextRequest("http://localhost/bff/client/sessions", {
    method,
    headers: { host: "localhost", origin },
  });
}

const context = {
  params: Promise.resolve({ sessionId: session.sessionId }),
};

beforeEach(() => {
  auth.readAccessToken.mockResolvedValue("server-cookie-token");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([session])));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("client sessions BFF", () => {
  it("lists only the validated session DTO with the server token", async () => {
    vi.stubEnv("WOK_API_BASE_URL", "http://api:8080/");
    const response = await GET(request("GET"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([session]);
    expect(fetch).toHaveBeenCalledWith(
      "http://api:8080/api/v1/client/sessions",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer server-cookie-token" },
      }),
    );
  });

  it("revokes a valid session and preserves 404 responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );
    expect((await DELETE(request("DELETE"), context)).status).toBe(204);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("missing", { status: 404 })),
    );
    const response = await DELETE(request("DELETE"), context);
    expect(response.status).toBe(404);
  });

  it("rejects invalid ids before reaching the backend", async () => {
    const invalid = { params: Promise.resolve({ sessionId: "not-a-uuid" }) };
    expect((await DELETE(request("DELETE"), invalid)).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
