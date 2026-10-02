// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const backend = vi.hoisted(() => ({ sendPublicAuthRequest: vi.fn() }));
vi.mock("@/modules/auth/server/backend-auth", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/modules/auth/server/backend-auth")
  >()),
  sendPublicAuthRequest: backend.sendPublicAuthRequest,
}));

function request(body: unknown, origin = "http://localhost:3001") {
  return new NextRequest("http://localhost:3001/bff/auth/flow", {
    method: "POST",
    headers: {
      host: "localhost:3001",
      origin,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
beforeEach(() => vi.resetAllMocks());
describe("public account flows", () => {
  it("blocks cross-origin actions without contacting the backend", async () => {
    expect(
      (
        await POST(
          request(
            { action: "resend", email: "ana@example.test" },
            "https://other.example",
          ),
        )
      ).status,
    ).toBe(403);
    expect(backend.sendPublicAuthRequest).not.toHaveBeenCalled();
  });
  it("rejects unknown actions and missing fields", async () => {
    for (const body of [
      null,
      { action: "../admin" },
      { action: "register", email: "ana@example.test" },
    ])
      expect((await POST(request(body))).status).toBe(400);
    expect(backend.sendPublicAuthRequest).not.toHaveBeenCalled();
  });
  it("forwards only the allowed fields and preserves passwords", async () => {
    backend.sendPublicAuthRequest.mockResolvedValue({
      message: "Solicitud recibida.",
    });
    const response = await POST(
      request({
        action: "register",
        email: " ana@example.test ",
        displayName: " Ana ",
        password: " StrongPassword1! ",
        roles: ["ADMIN"],
      }),
    );
    expect(response.status).toBe(200);
    expect(backend.sendPublicAuthRequest).toHaveBeenCalledWith(
      "/api/v1/auth/register",
      {
        email: "ana@example.test",
        displayName: "Ana",
        password: " StrongPassword1! ",
      },
    );
  });
});
