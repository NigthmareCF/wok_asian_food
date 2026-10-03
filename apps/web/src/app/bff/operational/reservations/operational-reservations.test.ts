// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET as pending } from "./pending/route";
import { PUT as decide } from "./[reservationId]/decision/route";

const auth = vi.hoisted(() => ({ readAccessToken: vi.fn() }));
vi.mock("@/modules/auth/server/auth-cookies", () => auth);

const reservationId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const pendingReservation = {
  id: reservationId,
  guests: 4,
  reservationAt: "2026-12-01T20:00:00Z",
  estimatedEndAt: "2026-12-01T22:00:00Z",
  notes: "Cerca de la ventana",
  rowVersion: 1,
  customerName: "Ana Ruiz",
  email: "ana@example.com",
};

function request(method: "GET" | "PUT", body?: unknown, headers = {}) {
  return new NextRequest("http://localhost/bff/operational/reservations", {
    method,
    headers: { origin: "http://localhost", host: "localhost", ...headers },
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

it("forwards the authenticated operational pending queue", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json([pendingReservation]));

  const response = await pending(request("GET"));

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([pendingReservation]);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/v1/operational/reservations/pending"),
    expect.objectContaining({
      method: "GET",
      headers: expect.objectContaining({ Authorization: "Bearer staff-token" }),
    }),
  );
});

it("requires a session before exposing operational reservations", async () => {
  auth.readAccessToken.mockResolvedValue(null);

  expect((await pending(request("GET"))).status).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
});

it("keeps backend role denial private and does not accept it as a decision", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response("forbidden details", { status: 403 }),
  );

  const response = await pending(request("GET"));

  expect(response.status).toBe(403);
  expect(await response.text()).not.toContain("forbidden details");
});

it("validates and forwards a decision with X-Request-Id", async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json({
      reservationId,
      decision: "CONFIRM",
      status: "CONFIRMED",
      rowVersion: 2,
      reason: "Capacidad disponible",
    }),
  );

  const response = await decide(
    request(
      "PUT",
      {
        decision: "CONFIRM",
        reason: " Capacidad disponible ",
        expectedVersion: 1,
      },
      { "X-Request-Id": requestId },
    ),
    { params: Promise.resolve({ reservationId }) },
  );

  expect(response.status).toBe(200);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining(
      `/api/v1/operational/reservations/${reservationId}/decision`,
    ),
    expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({
        decision: "CONFIRM",
        reason: "Capacidad disponible",
        expectedVersion: 1,
      }),
      headers: expect.objectContaining({
        Authorization: "Bearer staff-token",
        "X-Request-Id": requestId,
      }),
    }),
  );
});

it("rejects a malformed decision or request id before calling the API", async () => {
  const malformed = await decide(
    request(
      "PUT",
      { decision: "CONFIRM", reason: "no", expectedVersion: 0 },
      { "X-Request-Id": "invalid" },
    ),
    { params: Promise.resolve({ reservationId }) },
  );

  expect(malformed.status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});
