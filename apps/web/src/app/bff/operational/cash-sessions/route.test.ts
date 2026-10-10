// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET, POST as open } from "./route";
import { POST as movement } from "./[sessionId]/movements/route";
import { POST as close } from "./[sessionId]/close/route";

const auth = vi.hoisted(() => ({ readAccessToken: vi.fn() }));
vi.mock("@/modules/auth/server/auth-cookies", () => auth);
const sessionId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const session = {
  id: sessionId,
  registerCode: "MAIN",
  status: "OPEN",
  expectedCash: 100,
  countedCash: null,
  difference: null,
  openedBy: sessionId,
  openedAt: "2026-10-09T08:00:00Z",
  closedBy: null,
  closedAt: null,
  rowVersion: 1,
  breakdown: {
    opening: 100,
    sales: 0,
    tips: 0,
    income: 0,
    expenses: 0,
    withdrawals: 0,
    balance: 100,
  },
  reconciliations: [],
  movements: [],
};
function request(
  method: "GET" | "POST",
  body?: unknown,
  url = "http://localhost/bff/operational/cash-sessions",
) {
  return new NextRequest(url, {
    method,
    headers: {
      origin: "http://localhost",
      host: "localhost",
      "Idempotency-Key": requestId,
      "X-Request-Id": requestId,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
beforeEach(() => {
  auth.readAccessToken.mockResolvedValue("staff-token");
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("lista la sesión actual y conserva el registerCode", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json(session));
  expect((await GET(request("GET"))).status).toBe(200);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining(
      "/api/v1/operational/cash-sessions/current?registerCode=MAIN",
    ),
    expect.anything(),
  );
});
it("protege apertura, movimiento y cierre con idempotencia/versionado", async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(Response.json(session, { status: 201 }))
    .mockResolvedValueOnce(
      Response.json(
        {
          id: "33333333-3333-4333-8333-333333333333",
          movementType: "INCOME",
          amountDelta: 10,
          reason: "Venta",
          responsibleUserId: session.openedBy,
          occurredAt: session.openedAt,
        },
        { status: 201 },
      ),
    )
    .mockResolvedValueOnce(Response.json(session, { status: 200 }));
  expect(
    (await open(request("POST", { registerCode: "MAIN", openingFloat: 100 })))
      .status,
  ).toBe(201);
  expect(
    (
      await movement(
        request("POST", { type: "INCOME", amount: 10, reason: "Venta" }),
        { params: Promise.resolve({ sessionId }) },
      )
    ).status,
  ).toBe(201);
  expect(
    (
      await close(request("POST", { countedCash: 100, expectedVersion: 1 }), {
        params: Promise.resolve({ sessionId }),
      })
    ).status,
  ).toBe(200);
  expect(fetch).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      headers: expect.objectContaining({
        "Idempotency-Key": requestId,
        "X-Request-Id": requestId,
      }),
    }),
  );
});
it("rechaza datos inválidos sin contactar backend", async () => {
  expect(
    (await open(request("POST", { registerCode: "", openingFloat: -1 })))
      .status,
  ).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});
