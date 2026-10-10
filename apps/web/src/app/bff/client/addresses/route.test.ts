// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, PUT } from "./[addressId]/route";
import { GET } from "./route";

const auth = vi.hoisted(() => ({ readAccessToken: vi.fn() }));
const principal = vi.hoisted(() => ({ checkExpectedClientPrincipal: vi.fn() }));
vi.mock("@/modules/auth/server/auth-cookies", () => auth);
vi.mock("@/modules/clients/server/expected-client-principal", () => principal);

const owner = "11111111-1111-4111-8111-111111111111";
const addressId = "22222222-2222-4222-8222-222222222222";
const address = {
  addressId,
  label: "Casa",
  address: "Zona 10, avenida 1 2-34",
  contactPhone: "+502 5555-0101",
  isDefault: true,
  version: 2,
};

function request(method = "GET", body?: unknown, expected = owner) {
  return new NextRequest("http://localhost/bff/client/addresses", {
    method,
    headers: {
      host: "localhost",
      origin: "http://localhost",
      "X-Wok-Expected-Principal": expected,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const context = { params: Promise.resolve({ addressId }) };

beforeEach(() => {
  auth.readAccessToken.mockResolvedValue("cookie-token");
  principal.checkExpectedClientPrincipal.mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([address])));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("client address BFF", () => {
  it("normalizes an omitted reference and binds the expected principal", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ ...address, reference: null }]);
    expect(principal.checkExpectedClientPrincipal).toHaveBeenCalledWith(
      "cookie-token",
      expect.any(NextRequest),
    );
  });

  it("normalizes null reference and forwards expectedVersion", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...address, reference: null })));
    const response = await PUT(
      request("PUT", {
        label: " Casa ",
        address: " Zona 10, avenida 1 2-34 ",
        reference: null,
        contactPhone: " +502 5555-0101 ",
        isDefault: true,
        expectedVersion: 2,
      }),
      context,
    );
    expect(response.status).toBe(200);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({
      label: "Casa",
      address: "Zona 10, avenida 1 2-34",
      reference: "",
      contactPhone: "+502 5555-0101",
      isDefault: true,
      expectedVersion: 2,
    });
  });

  it("rejects an A/B principal mismatch before reaching the API", async () => {
    principal.checkExpectedClientPrincipal.mockResolvedValue({
      ok: false,
      status: 409,
      body: { message: "La sesión cambió." },
    });
    const response = await GET(request("GET", undefined, "33333333-3333-4333-8333-333333333333"));
    expect(response.status).toBe(409);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 204 for deletion and rejects invalid UUIDs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    expect((await DELETE(request("DELETE"), context)).status).toBe(204);
    const invalid = { params: Promise.resolve({ addressId: "bad" }) };
    expect((await DELETE(request("DELETE"), invalid)).status).toBe(400);
  });
});
