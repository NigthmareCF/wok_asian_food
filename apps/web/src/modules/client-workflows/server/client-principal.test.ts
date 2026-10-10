// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  GET as reservations,
  POST as reserve,
} from "@/app/bff/reservations/route";
import { GET as profile, PUT as update } from "@/app/bff/profile/route";
import { messagingEndpoint } from "@/modules/messaging/server/live-endpoint";
import { GET as users } from "@/app/bff/admin/users/route";
import { PUT as role } from "@/app/bff/admin/users/[userId]/roles/[roleCode]/route";
import { POST as createOrder } from "@/app/bff/operational/orders/route";
import { POST as appendOrder } from "@/app/bff/operational/orders/[orderId]/items/route";
const mocks = vi.hoisted(() => ({
  readAccessToken: vi.fn(),
  loadCurrentUser: vi.fn(),
}));
vi.mock("@/modules/auth/server/auth-cookies", () => ({
  readAccessToken: mocks.readAccessToken,
}));
vi.mock("@/modules/auth/server/backend-auth", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/modules/auth/server/backend-auth")
  >()),
  loadCurrentUser: mocks.loadCurrentUser,
}));
const id = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const current = {
  userId: id,
  displayName: "Prueba",
  email: "test@example.test",
  status: "ACTIVE",
  roles: ["CLIENT"],
  permissions: [],
};
function request(
  method = "GET",
  body?: unknown,
  expected = id,
  path = "/bff/test",
) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: {
      host: "localhost",
      origin: "http://localhost",
      "X-Wok-Expected-Principal": expected,
      "Idempotency-Key": id,
      "X-Request-Id": id,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
beforeEach(() => {
  mocks.readAccessToken.mockResolvedValue("test-cookie");
  mocks.loadCurrentUser.mockResolvedValue(current);
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it.each(["reservations", "profile", "messages", "users"])(
  "rechaza otra identidad antes de consultar %s",
  async (kind) => {
    const req = request("GET", undefined, other);
    const response =
      kind === "reservations"
        ? await reservations(req)
        : kind === "profile"
          ? await profile(req)
          : kind === "users"
            ? await users(req)
            : await messagingEndpoint(req, "client");
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("CLIENT_PRINCIPAL_CHANGED");
    expect(fetch).not.toHaveBeenCalled();
  },
);
it("no envía la reserva guardada bajo otro principal", async () => {
  const response = await reserve(
    request(
      "POST",
      {
        guests: 2,
        requestedAt: "2026-12-01T20:00:00Z",
        preorder: false,
        notes: "",
      },
      other,
    ),
  );
  expect(response.status).toBe(409);
  expect(fetch).not.toHaveBeenCalled();
});
it("valida perfil y remite exclusivamente su versión y datos permitidos", async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json({ ...current, phone: null, version: 2 }),
  );
  const response = await update(
    request("PUT", {
      displayName: "Prueba",
      phone: "",
      expectedVersion: 1,
      roles: ["ADMIN"],
    }),
  );
  expect(response.status).toBe(200);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/v1/client/profile"),
    expect.objectContaining({
      body: JSON.stringify({
        displayName: "Prueba",
        phone: "",
        expectedVersion: 1,
      }),
    }),
  );
});
it("limita las modificaciones administrativas al contrato de roles existente", async () => {
  const response = await role(
    request("PUT", {
      action: "GRANT",
      reason: "Prueba controlada",
      expectedVersion: 1,
    }),
    { params: Promise.resolve({ userId: other, roleCode: "SUPERADMIN" }) },
  );
  expect(response.status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});
it("no permite introducir otra ruta mediante filtros de usuarios", async () => {
  const response = await users(
    request("GET", undefined, id, "/bff/admin/users?offset=-1&target=other"),
  );
  expect(response.status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});

it.each(["GET", "PUT"])(
  "normaliza phone ausente en %s con JSON NON_NULL real",
  async (method) => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        userId: id,
        email: current.email,
        displayName: current.displayName,
        version: 2,
      }),
    );
    const req = request(
      method,
      method === "PUT"
        ? { displayName: "Prueba", phone: "", expectedVersion: 1 }
        : undefined,
    );
    const response = method === "GET" ? await profile(req) : await update(req);
    expect(response.status).toBe(200);
    expect((await response.json()).phone).toBeNull();
  },
);
it("un error GET no afirma incertidumbre de escritura", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("offline"));
  const response = await profile(request());
  expect(response.status).toBe(503);
  expect((await response.json()).message).toMatch(/consultar/);
});
it.each(["create", "append"])(
  "%s exige principal esperado y conserva el mismo token al comprobar y reenviar",
  async (mode) => {
    const payload = {
      items: [{ menuItemId: id, quantity: 1, fulfillment: "DINE_IN" }],
      ...(mode === "create"
        ? { accountId: id, channel: "DINE_IN", guestCount: 1 }
        : {}),
    };
    const call = (req: NextRequest) =>
      mode === "create"
        ? createOrder(req)
        : appendOrder(req, { params: Promise.resolve({ orderId: id }) });
    expect((await call(request("POST", payload, other))).status).toBe(409);
    const legacy = request("POST", payload);
    legacy.headers.delete("X-Wok-Expected-Principal");
    expect((await call(legacy)).status).toBe(409);
    expect(fetch).not.toHaveBeenCalled();
    vi.mocked(fetch).mockResolvedValue(Response.json({}));
    await call(request("POST", payload));
    expect(mocks.readAccessToken).toHaveBeenCalledTimes(3);
    expect(mocks.loadCurrentUser).toHaveBeenLastCalledWith("test-cookie");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/operational/orders"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-cookie",
          "Idempotency-Key": id,
        }),
      }),
    );
  },
);
