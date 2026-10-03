// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET, POST as create } from "./route";
import { POST as close } from "./[tableId]/close/route";
import { POST as open } from "./[tableId]/open/route";

const auth = vi.hoisted(() => ({ readAccessToken: vi.fn() }));
vi.mock("@/modules/auth/server/auth-cookies", () => auth);

const tableId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const table = {
  id: tableId,
  name: "Mesa 01",
  capacity: 4,
  zone: "PRINCIPAL",
  active: true,
  status: "FREE",
  rowVersion: 1,
  updatedAt: "2026-10-03T10:00:00Z",
  accountId: null,
  accountName: null,
  accountStatus: null,
};

function request(method: "GET" | "POST", body?: unknown, headers = "") {
  return new NextRequest(`http://localhost/bff/operational/tables${headers}`, {
    method,
    headers: {
      origin: "http://localhost",
      host: "localhost",
      ...(method === "POST" ? { "X-Request-Id": requestId } : {}),
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

it("forwards the authenticated table list and supported filters", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json([table]));

  const response = await GET(
    request(
      "GET",
      undefined,
      "?status=FREE&zone=PRINCIPAL&active=true&ignored=x",
    ),
  );

  expect(response.status).toBe(200);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining(
      "/api/v1/operational/tables?status=FREE&zone=PRINCIPAL&active=true",
    ),
    expect.objectContaining({
      method: "GET",
      headers: expect.objectContaining({ Authorization: "Bearer staff-token" }),
    }),
  );
});

it("requires a session before listing tables", async () => {
  auth.readAccessToken.mockResolvedValue(null);
  expect((await GET(request("GET"))).status).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
});

it("keeps backend role denial private", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response("backend authorization details", { status: 403 }),
  );

  const response = await GET(request("GET"));

  expect(response.status).toBe(403);
  expect(await response.text()).not.toContain("backend authorization details");
});

it("validates and forwards table creation with X-Request-Id", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json(table, { status: 201 }));
  const response = await create(
    request("POST", { name: " Mesa 01 ", capacity: 4, zone: " Principal " }),
  );

  expect(response.status).toBe(201);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/v1/operational/tables"),
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ name: "Mesa 01", capacity: 4, zone: "Principal" }),
      headers: expect.objectContaining({ "X-Request-Id": requestId }),
    }),
  );
});

it("rejects malformed creation before calling the API", async () => {
  const response = await create(
    request("POST", { name: "", capacity: 0, zone: "x" }),
  );
  expect(response.status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});

it("forwards open and close with the request identifier", async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(
      Response.json({ ...table, status: "OCCUPIED", rowVersion: 2 }),
    )
    .mockResolvedValueOnce(
      Response.json({ ...table, status: "CLEANING", rowVersion: 3 }),
    );

  expect(
    (await open(request("POST"), { params: Promise.resolve({ tableId }) }))
      .status,
  ).toBe(200);
  expect(
    (await close(request("POST"), { params: Promise.resolve({ tableId }) }))
      .status,
  ).toBe(200);
  expect(fetch).toHaveBeenNthCalledWith(
    1,
    expect.stringContaining(`/api/v1/operational/tables/${tableId}/open`),
    expect.objectContaining({
      headers: expect.objectContaining({ "X-Request-Id": requestId }),
    }),
  );
  expect(fetch).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining(`/api/v1/operational/tables/${tableId}/close`),
    expect.objectContaining({
      headers: expect.objectContaining({ "X-Request-Id": requestId }),
    }),
  );
});
