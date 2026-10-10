// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
import { DELETE, PUT } from "./[addressId]/route";

const auth = vi.hoisted(() => ({ readAccessToken: vi.fn() }));
vi.mock("@/modules/auth/server/auth-cookies", () => auth);

const address = {
  addressId: "11111111-1111-4111-8111-111111111111",
  label: "Casa",
  address: "Zona 10,  avenida 1 2-34",
  reference: null,
  contactPhone: "+502 5555-0101",
  isDefault: true,
  version: 2,
};

function request(method: string, body?: unknown, origin = "http://localhost") {
  return new NextRequest("http://localhost/bff/client/addresses", {
    method,
    headers: {
      host: "localhost",
      origin,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const context = { params: Promise.resolve({ addressId: address.addressId }) };

beforeEach(() => {
  auth.readAccessToken.mockResolvedValue("server-cookie-token");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([address])));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("client addresses BFF", () => {
  it("forwards the private list with the session token", async () => {
    vi.stubEnv("WOK_API_BASE_URL", "http://api:8080/");
    const response = await GET(request("GET"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([address]);
    expect(fetch).toHaveBeenCalledWith(
      "http://api:8080/api/v1/client/addresses",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer server-cookie-token" },
      }),
    );
  });

  it("validates and forwards only the create DTO", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(address)));
    const response = await POST(
      request("POST", {
        label: " Casa ",
        address: " Zona 10, avenida 1 2-34 ",
        reference: " Portón ",
        contactPhone: " +502 5555-0101 ",
        isDefault: true,
        version: 99,
      }),
    );
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/client/addresses"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          label: "Casa",
          address: "Zona 10, avenida 1 2-34",
          reference: "Portón",
          contactPhone: "+502 5555-0101",
          isDefault: true,
        }),
      }),
    );
  });

  it("requires the expected version for updates and preserves conflicts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("conflict", { status: 409 })),
    );
    const response = await PUT(
      request("PUT", {
        label: "Casa",
        address: "Zona 10, avenida 1 2-34",
        reference: "",
        contactPhone: "+502 5555-0101",
        isDefault: true,
        expectedVersion: 2,
      }),
      context,
    );
    expect(response.status).toBe(409);
  });

  it("supports deletion and rejects an invalid address id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );
    expect((await DELETE(request("DELETE"), context)).status).toBe(204);
    const invalid = { params: Promise.resolve({ addressId: "bad" }) };
    expect((await DELETE(request("DELETE"), invalid)).status).toBe(400);
  });
});
