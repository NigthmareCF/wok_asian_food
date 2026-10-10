// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { GET as addresses, POST as createAddress } from "./addresses/route";
import {
  PUT as updateAddress,
  DELETE as deleteAddress,
} from "./addresses/[addressId]/route";
import { GET as sessions } from "./sessions/route";
import { DELETE as revokeSession } from "./sessions/[sessionId]/route";

const auth = vi.hoisted(() => ({
  readAccessToken: vi.fn(),
  loadCurrentUser: vi.fn(),
}));
vi.mock("@/modules/auth/server/auth-cookies", () => auth);
vi.mock("@/modules/auth/server/backend-auth", async (original) => ({
  ...(await original<typeof import("@/modules/auth/server/backend-auth")>()),
  loadCurrentUser: auth.loadCurrentUser,
}));
const owner = "40000000-0000-4000-8000-000000000001";
const id = "10000000-0000-4000-8000-000000000001";
const address = {
  addressId: id,
  label: "Casa",
  address: "Zona 1 Guatemala",
  contactPhone: "12345678",
  isDefault: true,
  version: 1,
};
const payload = {
  label: "Casa",
  address: "Zona 1 Guatemala",
  contactPhone: "12345678",
  isDefault: true,
};
function request(
  path: string,
  method = "GET",
  principal = owner,
  body?: unknown,
) {
  return new NextRequest(`http://localhost/bff/client/${path}`, {
    method,
    headers: {
      origin: "http://localhost",
      host: "localhost",
      "X-Wok-Expected-Principal": principal,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
beforeEach(() => {
  auth.readAccessToken.mockResolvedValue("client-token");
  auth.loadCurrentUser.mockResolvedValue({
    userId: owner,
    email: "client@example.test",
    displayName: "Cliente",
    status: "ACTIVE",
    roles: ["CLIENT"],
    permissions: [],
  });
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("normalizes optional address references and session device names omitted by NON_NULL", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(Response.json([address]));
  expect(await (await addresses(request("addresses"))).json()).toEqual([
    { ...address, reference: null },
  ]);
  const session = {
    sessionId: id,
    clientType: "WEB",
    createdAt: "2026-10-09T12:00:00Z",
    lastActivityAt: "2026-10-09T12:30:00Z",
    current: true,
  };
  vi.mocked(fetch).mockResolvedValueOnce(Response.json([session]));
  expect(await (await sessions(request("sessions"))).json()).toEqual([
    { ...session, deviceName: null },
  ]);
});

it("preserves validation and expectedVersion when creating/updating addresses", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json(address, { status: 201 }),
  );
  expect(
    (await createAddress(request("addresses", "POST", owner, payload))).status,
  ).toBe(201);
  expect(fetch).toHaveBeenLastCalledWith(
    expect.stringContaining("/client/addresses"),
    expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: "Bearer client-token",
      }),
    }),
  );
  expect(
    JSON.parse(String(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.body)),
  ).toEqual({ ...payload, reference: "" });
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({ ...address, version: 2 }),
  );
  expect(
    (
      await updateAddress(
        request(`addresses/${id}`, "PUT", owner, {
          ...payload,
          expectedVersion: 1,
        }),
        { params: Promise.resolve({ addressId: id }) },
      )
    ).status,
  ).toBe(200);
  expect(fetch).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({
      method: "PUT",
    }),
  );
  expect(
    JSON.parse(String(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.body)),
  ).toEqual({ ...payload, reference: "", expectedVersion: 1 });
});

it("accepts only a confirmed 204 deletion and does not parse an empty body", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
  const deleted = await deleteAddress(request(`addresses/${id}`, "DELETE"), {
    params: Promise.resolve({ addressId: id }),
  });
  expect(deleted.status).toBe(204);
  expect(await deleted.text()).toBe("");
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
  expect(
    (
      await revokeSession(request(`sessions/${id}`, "DELETE"), {
        params: Promise.resolve({ sessionId: id }),
      })
    ).status,
  ).toBe(204);
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ok: true }));
  expect(
    (
      await revokeSession(request(`sessions/${id}`, "DELETE"), {
        params: Promise.resolve({ sessionId: id }),
      })
    ).status,
  ).toBe(503);
});

it("rejects session changes for reads and mutations before forwarding", async () => {
  const other = "40000000-0000-4000-8000-000000000002";
  expect((await addresses(request("addresses", "GET", other))).status).toBe(
    409,
  );
  expect((await sessions(request("sessions", "GET", other))).status).toBe(409);
  expect(
    (await createAddress(request("addresses", "POST", other, payload))).status,
  ).toBe(409);
  expect(
    (
      await updateAddress(
        request(`addresses/${id}`, "PUT", other, {
          ...payload,
          expectedVersion: 1,
        }),
        { params: Promise.resolve({ addressId: id }) },
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await deleteAddress(request(`addresses/${id}`, "DELETE", other), {
        params: Promise.resolve({ addressId: id }),
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await revokeSession(request(`sessions/${id}`, "DELETE", other), {
        params: Promise.resolve({ sessionId: id }),
      })
    ).status,
  ).toBe(409);
  expect(fetch).not.toHaveBeenCalled();
});

it("does not forward invalid identifiers or updates without a version", async () => {
  expect(
    (
      await deleteAddress(request("addresses/bad", "DELETE"), {
        params: Promise.resolve({ addressId: "bad" }),
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await revokeSession(request("sessions/bad", "DELETE"), {
        params: Promise.resolve({ sessionId: "bad" }),
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await updateAddress(request(`addresses/${id}`, "PUT", owner, payload), {
        params: Promise.resolve({ addressId: id }),
      })
    ).status,
  ).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});
