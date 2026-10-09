// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PUT } from "./route";

const auth = vi.hoisted(() => ({ readAccessToken: vi.fn() }));
vi.mock("@/modules/auth/server/auth-cookies", () => auth);

const profile = {
  userId: "11111111-1111-4111-8111-111111111111",
  email: "cliente@wok.demo",
  displayName: "Cliente Demo",
  phone: "+502 5555-0101",
  version: 3,
};

function request(method: "GET" | "PUT", body?: unknown, origin = "http://localhost") {
  return new NextRequest("http://localhost/bff/client/profile", {
    method,
    headers: { host: "localhost", origin, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  auth.readAccessToken.mockResolvedValue("server-cookie-token");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(profile)));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("client profile BFF", () => {
  it("reads the profile with the HttpOnly session token", async () => {
    vi.stubEnv("WOK_API_BASE_URL", "http://api:8080/");
    const response = await GET(request("GET"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(profile);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetch).toHaveBeenCalledWith(
      "http://api:8080/api/v1/client/profile",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer server-cookie-token" },
      }),
    );
  });

  it("validates the editable DTO before forwarding only its fields", async () => {
    const response = await PUT(
      request("PUT", {
        displayName: "  Nueva Cliente ",
        phone: " +502 5555-0102 ",
        expectedVersion: 3,
        email: "should-not-forward@example.com",
      }),
    );
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/client/profile"),
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          displayName: "Nueva Cliente",
          phone: "+502 5555-0102",
          expectedVersion: 3,
        }),
      }),
    );
  });

  it("requires a same-origin session for updates and preserves 409", async () => {
    expect((await PUT(request("PUT", { displayName: "Cliente", phone: "", expectedVersion: 3 }, "https://attacker.example"))).status).toBe(403);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private", { status: 409 })));
    const response = await PUT(request("PUT", { displayName: "Cliente", phone: "", expectedVersion: 3 }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      message: "El estado cambió o la clave ya se utilizó. Actualiza la información antes de continuar.",
    });
  });

  it("rejects invalid editable data before calling the API", async () => {
    const response = await PUT(
      request("PUT", { displayName: "A", phone: "abc", expectedVersion: 0 }),
    );
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
