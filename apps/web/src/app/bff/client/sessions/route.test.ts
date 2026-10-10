// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "./[sessionId]/route";
import { GET } from "./route";

const auth = vi.hoisted(() => ({ readAccessToken: vi.fn() }));
const principal = vi.hoisted(() => ({ checkExpectedClientPrincipal: vi.fn() }));
vi.mock("@/modules/auth/server/auth-cookies", () => auth);
vi.mock("@/modules/clients/server/expected-client-principal", () => principal);

const owner = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const session = {
  sessionId,
  clientType: "WEB",
  createdAt: "2026-10-08T12:00:00Z",
  lastActivityAt: "2026-10-08T12:30:00Z",
  current: true,
};

function request(method = "GET", expected = owner) {
  return new NextRequest("http://localhost/bff/client/sessions", {
    method,
    headers: {
      host: "localhost",
      origin: "http://localhost",
      "X-Wok-Expected-Principal": expected,
    },
  });
}

const context = { params: Promise.resolve({ sessionId }) };

beforeEach(() => {
  auth.readAccessToken.mockResolvedValue("cookie-token");
  principal.checkExpectedClientPrincipal.mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([session])));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("client session BFF", () => {
  it("normalizes an omitted deviceName to null", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ ...session, deviceName: null }]);
  });

  it("normalizes a null deviceName", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([{ ...session, deviceName: null }])));
    expect(await (await GET(request())).json()).toEqual([{ ...session, deviceName: null }]);
  });

  it("blocks an A/B mismatch and invalid session ids", async () => {
    principal.checkExpectedClientPrincipal.mockResolvedValue({
      ok: false,
      status: 403,
      body: { message: "No tienes acceso." },
    });
    expect((await GET(request())).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
    const invalid = { params: Promise.resolve({ sessionId: "bad" }) };
    expect((await DELETE(request("DELETE"), invalid)).status).toBe(400);
  });

  it("returns 204 for revocation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    expect((await DELETE(request("DELETE"), context)).status).toBe(204);
  });
});
