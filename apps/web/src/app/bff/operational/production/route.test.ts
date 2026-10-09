// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
const auth = vi.hoisted(() => ({ readAccessToken: vi.fn() }));
vi.mock("@/modules/auth/server/auth-cookies", () => auth);
const id = "11111111-1111-4111-8111-111111111111";
const key = "22222222-2222-4222-8222-222222222222";
const req = (method: "GET" | "POST", body?: unknown) =>
  new NextRequest("http://localhost/bff/operational/production", {
    method,
    headers: {
      origin: "http://localhost",
      host: "localhost",
      "Idempotency-Key": key,
      "X-Request-Id": key,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
beforeEach(() => {
  auth.readAccessToken.mockResolvedValue("staff-token");
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("lee lotes de producción reales", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json([]));
  expect((await GET(req("GET"))).status).toBe(200);
});
it("valida registro idempotente y correlacionado", async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json(
      {
        batchId: id,
        producedItemId: id,
        quantity: 1,
        yieldQuantity: 1,
        producedOnHand: 1,
        items: [],
        idempotentReplay: false,
      },
      { status: 201 },
    ),
  );
  expect(
    (await POST(req("POST", { producedItemId: id, quantity: 1 }))).status,
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
});
