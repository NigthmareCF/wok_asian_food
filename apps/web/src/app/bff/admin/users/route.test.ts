// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const auth = vi.hoisted(() => ({ readAccessToken: vi.fn() }));
vi.mock("@/modules/auth/server/auth-cookies", () => auth);

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "ana@example.test",
  displayName: "Ana Pérez",
  status: "ACTIVE",
  rowVersion: 1,
  createdAt: "2026-10-01T12:00:00Z",
  roles: ["ADMIN"],
};

function request(query = "") {
  return new NextRequest(`http://localhost/bff/admin/users${query}`, {
    method: "GET",
    headers: { host: "localhost" },
  });
}

beforeEach(() => {
  auth.readAccessToken.mockResolvedValue("admin-token");
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("admin users BFF", () => {
  it("forwards supported search and pagination with the session token", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json([user]));
    const response = await GET(request("?search=ana&limit=20&offset=40"));
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/admin/users?search=ana&limit=20&offset=40",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer admin-token" },
      }),
    );
  });

  it("requires a session and validates filters before the backend", async () => {
    auth.readAccessToken.mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();

    auth.readAccessToken.mockResolvedValue("admin-token");
    expect((await GET(request("?limit=0"))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps backend 403 responses neutral", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("private", { status: 403 }),
    );
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("private");
  });

  it("rejects malformed upstream DTOs", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json([{ ...user, rowVersion: 0 }]),
    );
    expect((await GET(request())).status).toBe(503);
  });
});
