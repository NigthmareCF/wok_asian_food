// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PUT } from "./route";

const auth = vi.hoisted(() => ({ readAccessToken: vi.fn() }));
vi.mock("@/modules/auth/server/auth-cookies", () => auth);

const userId = "11111111-1111-4111-8111-111111111111";
const user = {
  id: userId,
  email: "ana@example.test",
  displayName: "Ana Pérez",
  status: "ACTIVE",
  rowVersion: 2,
  createdAt: "2026-10-01T12:00:00Z",
  roles: ["ADMIN"],
};

function request(body: unknown) {
  return new NextRequest(
    `http://localhost/bff/admin/users/${userId}/roles/ADMIN`,
    {
      method: "PUT",
      headers: {
        origin: "http://localhost",
        host: "localhost",
        "Content-Type": "application/json",
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

describe("admin role assignment BFF", () => {
  it("forwards only the supported role change DTO", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json(user));
    const response = await PUT(
      request({ action: "GRANT", reason: "Cobertura", expectedVersion: 2 }),
      { params: Promise.resolve({ userId, roleCode: "ADMIN" }) },
    );
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      `http://localhost:8080/api/v1/admin/users/${userId}/roles/ADMIN`,
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          action: "GRANT",
          reason: "Cobertura",
          expectedVersion: 2,
        }),
      }),
    );
  });

  it.each([
    { action: "CREATE", reason: "No", expectedVersion: 2 },
    { action: "GRANT", reason: "x", expectedVersion: 2 },
    { action: "GRANT", reason: "Motivo", expectedVersion: 0 },
  ])("rejects an unsupported or invalid body", async (body) => {
    expect(
      (
        await PUT(request(body), {
          params: Promise.resolve({ userId, roleCode: "ADMIN" }),
        })
      ).status,
    ).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects unsupported role codes and preserves 409", async () => {
    expect(
      (
        await PUT(
          request({ action: "GRANT", reason: "Motivo", expectedVersion: 2 }),
          {
            params: Promise.resolve({ userId, roleCode: "CLIENT" }),
          },
        )
      ).status,
    ).toBe(400);
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 409 }));
    expect(
      (
        await PUT(
          request({ action: "GRANT", reason: "Motivo", expectedVersion: 2 }),
          {
            params: Promise.resolve({ userId, roleCode: "ADMIN" }),
          },
        )
      ).status,
    ).toBe(409);
  });
});
