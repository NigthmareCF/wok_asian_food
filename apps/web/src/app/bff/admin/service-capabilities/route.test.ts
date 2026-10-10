// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const auth = vi.hoisted(() => ({ readAccessToken: vi.fn() }));
vi.mock("@/modules/auth/server/auth-cookies", () => auth);

const capability = {
  code: "DELIVERY",
  status: "MANUAL_APPROVAL",
  reason: "Revalidar cobertura",
  rowVersion: 3,
  policyVersion: 4,
  effectiveFrom: "2026-10-01T12:00:00Z",
  effectiveUntil: null,
};

function request() {
  return new NextRequest("http://localhost/bff/admin/service-capabilities", {
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

describe("admin service capabilities BFF", () => {
  it("forwards the authenticated request and validates the real DTO", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json([capability]));
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([capability]);
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/admin/service-capabilities",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer admin-token" },
      }),
    );
  });

  it("handles missing sessions, forbidden responses and malformed DTOs", async () => {
    auth.readAccessToken.mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
    auth.readAccessToken.mockResolvedValue("admin-token");
    vi.mocked(fetch).mockResolvedValue(
      new Response("private", { status: 403 }),
    );
    expect((await GET(request())).status).toBe(403);
    vi.mocked(fetch).mockResolvedValue(
      Response.json([{ ...capability, status: "UNKNOWN" }]),
    );
    expect((await GET(request())).status).toBe(503);
  });
});
