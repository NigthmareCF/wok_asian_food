// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PUT } from "./route";

const auth = vi.hoisted(() => ({ readAccessToken: vi.fn() }));
vi.mock("@/modules/auth/server/auth-cookies", () => auth);

const capability = {
  code: "DELIVERY",
  status: "PAUSED",
  reason: "Mantenimiento",
  rowVersion: 4,
  policyVersion: 5,
  effectiveFrom: "2026-10-01T12:00:00Z",
  effectiveUntil: null,
};
const requestId = "11111111-1111-4111-8111-111111111111";

function request(body: unknown) {
  return new NextRequest(
    "http://localhost/bff/admin/service-capabilities/DELIVERY",
    {
      method: "PUT",
      headers: {
        origin: "http://localhost",
        host: "localhost",
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
      },
      body: JSON.stringify(body),
    },
  );
}

beforeEach(() => {
  auth.readAccessToken.mockResolvedValue("admin-token");
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("admin service capability update BFF", () => {
  it("forwards status, reason, expectedVersion and X-Request-Id", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json(capability));
    const response = await PUT(
      request({
        status: "PAUSED",
        reason: "Mantenimiento",
        expectedVersion: 3,
      }),
      { params: Promise.resolve({ code: "DELIVERY" }) },
    );
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/admin/service-capabilities/DELIVERY",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          status: "PAUSED",
          reason: "Mantenimiento",
          expectedVersion: 3,
        }),
        headers: expect.objectContaining({ "X-Request-Id": requestId }),
      }),
    );
  });

  it("rejects invalid changes before reaching the API and preserves 404/409", async () => {
    expect(
      (
        await PUT(
          request({ status: "UNKNOWN", reason: "Motivo", expectedVersion: 3 }),
          {
            params: Promise.resolve({ code: "DELIVERY" }),
          },
        )
      ).status,
    ).toBe(400);
    expect(fetch).not.toHaveBeenCalled();

    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));
    expect(
      (
        await PUT(
          request({ status: "PAUSED", reason: "Motivo", expectedVersion: 3 }),
          {
            params: Promise.resolve({ code: "DELIVERY" }),
          },
        )
      ).status,
    ).toBe(404);
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 409 }));
    expect(
      (
        await PUT(
          request({ status: "PAUSED", reason: "Motivo", expectedVersion: 3 }),
          {
            params: Promise.resolve({ code: "DELIVERY" }),
          },
        )
      ).status,
    ).toBe(409);
  });
});
