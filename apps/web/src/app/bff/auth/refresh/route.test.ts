// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BackendAuthError } from "@/modules/auth/server/backend-auth";
import { POST } from "./route";

const auth = vi.hoisted(() => ({
  currentSession: vi.fn(),
  refreshWithBackend: vi.fn(),
  loadCurrentUser: vi.fn(),
  storeAuthCookies: vi.fn(),
  clearAuthCookies: vi.fn(),
}));
vi.mock("@/modules/auth/server/auth-session", () => ({
  currentSession: auth.currentSession,
}));
vi.mock("@/modules/auth/server/auth-cookies", () => ({
  storeAuthCookies: auth.storeAuthCookies,
  clearAuthCookies: auth.clearAuthCookies,
}));
vi.mock("@/modules/auth/server/backend-auth", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/modules/auth/server/backend-auth")
  >()),
  refreshWithBackend: auth.refreshWithBackend,
  loadCurrentUser: auth.loadCurrentUser,
}));
function request(origin = "http://localhost:3001") {
  return new NextRequest(
    "http://localhost:3001/bff/auth/refresh?next=%2Fclient%2Fcart",
    {
      method: "POST",
      headers: {
        host: "localhost:3001",
        origin,
        cookie: "wok_refresh_token=test-refresh; wok_remember_session=true",
      },
    },
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  auth.currentSession.mockResolvedValue(null);
});
describe("session renewal", () => {
  it("reuses valid access without rotating the refresh token", async () => {
    auth.currentSession.mockResolvedValue({ roles: ["CLIENT"] });
    expect(await (await POST(request())).json()).toEqual({
      redirectTo: "/client/cart",
    });
    expect(auth.refreshWithBackend).not.toHaveBeenCalled();
  });
  it("renews expired access and preserves the session preference", async () => {
    const tokens = {
      accessToken: "test-access",
      refreshToken: "test-new-refresh",
      tokenType: "Bearer",
      expiresInSeconds: 900,
    };
    auth.refreshWithBackend.mockResolvedValue(tokens);
    auth.loadCurrentUser.mockResolvedValue({ roles: ["CLIENT"] });
    expect(await (await POST(request())).json()).toEqual({
      redirectTo: "/client/cart",
    });
    expect(auth.storeAuthCookies).toHaveBeenCalledWith(tokens, true);
  });
  it("clears invalid credentials but retains them during an outage", async () => {
    auth.refreshWithBackend.mockRejectedValue(new BackendAuthError(401));
    expect((await POST(request())).status).toBe(401);
    expect(auth.clearAuthCookies).toHaveBeenCalledOnce();
    auth.clearAuthCookies.mockClear();
    auth.refreshWithBackend.mockRejectedValue(new BackendAuthError(503));
    expect((await POST(request())).status).toBe(503);
    expect(auth.clearAuthCookies).not.toHaveBeenCalled();
  });
  it("rejects a foreign origin before reading credentials", async () => {
    expect((await POST(request("https://other.example"))).status).toBe(403);
    expect(auth.currentSession).not.toHaveBeenCalled();
  });
});
