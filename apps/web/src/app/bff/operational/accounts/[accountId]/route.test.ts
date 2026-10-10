// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";
import { POST } from "./payments/route";

const auth = vi.hoisted(() => ({ readAccessToken: vi.fn() }));
vi.mock("@/modules/auth/server/auth-cookies", () => auth);
const accountId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const account = { account: { id: accountId, name: "Cuenta 1", status: "OPEN" }, orders: [], total: 10, paid: 0, balance: 10, tips: 0, payments: [] };
const request = (method: "GET" | "POST", body?: unknown) => new NextRequest(`http://localhost/bff/operational/accounts/${accountId}${method === "POST" ? "/payments" : ""}`, { method, headers: { origin: "http://localhost", host: "localhost", "Idempotency-Key": requestId, "X-Request-Id": requestId, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
beforeEach(() => { auth.readAccessToken.mockResolvedValue("staff-token"); vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("consulta el total y saldo calculados por backend", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json(account));
  expect((await GET(request("GET"), { params: Promise.resolve({ accountId }) })).status).toBe(200);
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`/api/v1/operational/accounts/${accountId}`), expect.anything());
});
it("valida método e idempotencia del pago", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ paymentId: accountId, accountId, amount: 10, balance: 0 }, { status: 201 }));
  expect((await POST(request("POST", { method: "CASH", amount: 10 }), { params: Promise.resolve({ accountId }) })).status).toBe(201);
  expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ headers: expect.objectContaining({ "Idempotency-Key": requestId, "X-Request-Id": requestId }) }));
  expect((await POST(request("POST", { method: "ONLINE" }), { params: Promise.resolve({ accountId }) })).status).toBe(400);
});
