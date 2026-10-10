// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";
import { POST } from "./[itemId]/movements/route";
const auth = vi.hoisted(() => ({ readAccessToken: vi.fn() }));
vi.mock("@/modules/auth/server/auth-cookies", () => auth);
const itemId = "11111111-1111-4111-8111-111111111111";
const key = "22222222-2222-4222-8222-222222222222";
const req = (method: "GET" | "POST", body?: unknown) =>
  new NextRequest(
    `http://localhost/bff/operational/inventory${method === "POST" ? `/${itemId}/movements` : "?status=LOW&search=arroz"}`,
    {
      method,
      headers: {
        origin: "http://localhost",
        host: "localhost",
        "Idempotency-Key": key,
        "X-Request-Id": key,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
beforeEach(() => {
  auth.readAccessToken.mockResolvedValue("staff-token");
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("reenvía filtros y sesión al listado", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json([]));
  expect((await GET(req("GET"))).status).toBe(200);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("search=arroz&status=LOW"),
    expect.anything(),
  );
});
it("valida movimiento e idempotencia", async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json(
      {
        movementId: itemId,
        itemId,
        type: "ENTRY",
        quantityDelta: 1,
        quantityOnHand: 3,
        unit: "KG",
        idempotentReplay: false,
      },
      { status: 201 },
    ),
  );
  expect(
    (
      await POST(req("POST", { type: "ENTRY", quantity: 1 }), {
        params: Promise.resolve({ itemId }),
      })
    ).status,
  ).toBe(201);
  expect(fetch).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      headers: expect.objectContaining({
        "Idempotency-Key": key,
        "X-Request-Id": key,
      }),
    }),
  );
  expect(
    (
      await POST(req("POST", { type: "BAD", quantity: 1 }), {
        params: Promise.resolve({ itemId }),
      })
    ).status,
  ).toBe(400);
});
