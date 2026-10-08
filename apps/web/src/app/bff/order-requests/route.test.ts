// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST, GET as history } from "./route";
import { GET as detail, DELETE as cancel } from "./[requestId]/route";
const auth = vi.hoisted(() => ({ readAccessToken: vi.fn() }));
vi.mock("@/modules/auth/server/auth-cookies", () => auth);
const id = "11111111-1111-4111-8111-111111111111";
const payload = {
  requestedFor: "2026-12-10T18:00:00Z",
  customerNote: " prueba ",
  items: [{ menuItemId: id, quantity: 2 }],
  subtotal: 0.01,
};
const receipt = {
  requestId: id,
  status: "PENDING_REVIEW",
  requestedFor: payload.requestedFor,
  subtotal: 136,
  currency: "GTQ",
  idempotentReplay: false,
};
function request(body: unknown = payload, origin = "http://localhost") {
  return new NextRequest("http://localhost/bff/order-requests", {
    method: "POST",
    headers: {
      origin,
      host: "localhost",
      "Idempotency-Key": id,
      "X-Wok-Expected-Principal": id,
    },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  auth.readAccessToken.mockResolvedValue("server-cookie-token");
  installFetch(
    vi.fn().mockResolvedValue(Response.json(receipt, { status: 202 })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("pickup BFF", () => {
  it.each(["https://attacker.example", ""])(
    "rejects foreign or missing origins",
    async (origin) => {
      expect((await POST(request(payload, origin))).status).toBe(403);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("requires a session cookie", async () => {
    auth.readAccessToken.mockResolvedValue(undefined);
    expect((await POST(request())).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(
    [
      [],
      [{ menuItemId: id, quantity: 51 }],
      [{ menuItemId: "fixture", quantity: 1 }],
      [
        { menuItemId: id, quantity: 1 },
        { menuItemId: id, quantity: 2 },
      ],
    ].map((items) => ({ items })),
  )("rejects invalid lines before sending", async ({ items }) => {
    expect((await POST(request({ ...payload, items }))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("sends only permitted fields, the cookie token and the idempotency key", async () => {
    vi.stubEnv("WOK_API_BASE_URL", "http://api:8080");
    const response = await POST(request());
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(receipt);
    expect(fetch).toHaveBeenCalledWith(
      "http://api:8080/api/v1/client/order-requests",
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer server-cookie-token",
          "Idempotency-Key": id,
        },
        body: JSON.stringify({
          requestedFor: payload.requestedFor,
          customerNote: "prueba",
          items: payload.items,
        }),
      }),
    );
  });
  it.each([400, 401, 403, 409, 422, 500])(
    "handles backend status %s without exposing raw diagnostics",
    async (status) => {
      installFetch(
        vi
          .fn()
          .mockResolvedValue(new Response("private diagnostics", { status })),
      );
      const response = await POST(request());
      expect(response.status).toBe(status === 500 ? 503 : status);
      const body = await response.json();
      expect(JSON.stringify(body)).not.toContain("private diagnostics");
      expect(body.code).not.toBe("CLIENT_UPDATE_REQUIRED");
    },
  );
  it("reports uncertain network outcomes without issuing another POST", async () => {
    installFetch(vi.fn().mockRejectedValue(new Error("timeout")));
    expect((await POST(request())).status).toBe(503);
    expect(
      vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(1);
  });
  it.each(["origin", "session", "payload", "key"])(
    "keeps %s validation before an absent principal header",
    async (invalid) => {
      vi.stubGlobal("fetch", vi.fn());
      const req = request(invalid === "payload" ? { items: [] } : payload);
      req.headers.delete("X-Wok-Expected-Principal");
      if (invalid === "origin") req.headers.delete("origin");
      if (invalid === "session") auth.readAccessToken.mockResolvedValue(undefined);
      if (invalid === "key") req.headers.set("Idempotency-Key", "invalid");
      const response = await POST(req);
      expect(response.status).toBe(
        invalid === "origin" ? 403 : invalid === "session" ? 401 : 400,
      );
      expect((await response.json()).code).not.toBe("CLIENT_UPDATE_REQUIRED");
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});

function installFetch(domainFetch: typeof fetch) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: RequestInfo | URL, init?: RequestInit) =>
      new URL(String(url)).pathname === "/api/v1/auth/me"
        ? Promise.resolve(
            Response.json({
              userId: id,
              email: "client@mock.invalid",
              displayName: "MOCK_ONLY Client",
              status: "ACTIVE",
              roles: ["CLIENT"],
              permissions: [],
            }),
          )
        : domainFetch(url, init),
    ),
  );
}

const currentUser = {
  userId: id,
  email: "client@mock.invalid",
  displayName: "MOCK_ONLY Client",
  status: "ACTIVE",
  roles: ["CLIENT"],
  permissions: [],
};
const otherPrincipal = "22222222-2222-4222-8222-222222222222";
const operations = ["POST", "history", "detail", "DELETE"] as const;
function boundaryRequest(
  operation: (typeof operations)[number],
  expected: string | null = id,
) {
  const method =
    operation === "POST" || operation === "DELETE" ? operation : "GET";
  const url = `http://localhost/bff/order-requests${operation === "detail" || operation === "DELETE" ? `/${id}` : ""}`;
  return new NextRequest(url, {
    method,
    headers: {
      origin: "http://localhost",
      host: "localhost",
      "Idempotency-Key": id,
      ...(expected === null ? {} : { "X-Wok-Expected-Principal": expected }),
    },
    ...(method === "POST" ? { body: JSON.stringify(payload) } : {}),
  });
}
function invokeBoundary(
  operation: (typeof operations)[number],
  expected: string | null = id,
) {
  const req = boundaryRequest(operation, expected);
  const context = { params: Promise.resolve({ requestId: id }) };
  return operation === "POST"
    ? POST(req)
    : operation === "history"
      ? history(req)
      : operation === "detail"
        ? detail(req, context)
        : cancel(req, context);
}
function domainResponse(operation: (typeof operations)[number]) {
  return Response.json(
    operation === "history"
      ? [receipt]
      : operation === "DELETE"
        ? { requestId: id, status: "CANCELLED" }
        : operation === "detail"
          ? { ...receipt, customerNote: "MOCK_ONLY", items: [] }
          : receipt,
    { status: operation === "POST" ? 202 : 200 },
  );
}

describe.each(operations)("expected pickup principal: %s", (operation) => {
  it("requires a tab update for an absent header without calling /me or domain", async () => {
    auth.readAccessToken.mockResolvedValue("MOCK_ONLY_switched_B");
    vi.stubGlobal("fetch", vi.fn());
    const response = await invokeBoundary(operation, null);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: "CLIENT_UPDATE_REQUIRED",
      message:
        "Actualiza esta pestaña para continuar. No cierres la pestaña ni borres sus datos. Después, reintenta la misma solicitud.",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetch).not.toHaveBeenCalled();
    expect(auth.readAccessToken).toHaveBeenCalledTimes(1);
  });
  it.each(["", "invalid", `${id}, ${otherPrincipal}`])(
    "requires a valid header (%s) without calling the API",
    async (expected) => {
      vi.stubGlobal("fetch", vi.fn());
      const response = await invokeBoundary(operation, expected);
      expect(response.status).toBe(400);
      expect((await response.json()).code).not.toBe("CLIENT_UPDATE_REQUIRED");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(fetch).not.toHaveBeenCalled();
      expect(auth.readAccessToken).toHaveBeenCalledTimes(1);
    },
  );
  it("rejects A's operation under B's credential without exposing B or sending to domain", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ ...currentUser, userId: otherPrincipal }),
        ),
    );
    const response = await invokeBoundary(operation);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe("CLIENT_PRINCIPAL_CHANGED");
    expect(JSON.stringify(body)).not.toContain(otherPrincipal);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain(
      "/api/v1/auth/me",
    );
    expect(auth.readAccessToken).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403, 429, 500, 503, 404])(
    "blocks the domain on /me status %s",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            new Response("MOCK_ONLY private diagnostic", { status }),
          ),
      );
      const response = await invokeBoundary(operation);
      expect(response.status).toBe([401, 403].includes(status) ? status : 503);
      const body = await response.json();
      expect(JSON.stringify(body)).not.toContain("private diagnostic");
      if (![401, 403].includes(status))
        expect(body.code).toBe("CLIENT_PRINCIPAL_UNVERIFIED");
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(response.headers.get("cache-control")).toBe("no-store");
    },
  );
  it.each(["network", "json", "shape"])(
    "blocks the domain on unverifiable identity (%s)",
    async (kind) => {
      const fetcher =
        kind === "network"
          ? vi.fn().mockRejectedValue(new Error("MOCK_ONLY network"))
          : vi
              .fn()
              .mockResolvedValue(
                kind === "json"
                  ? new Response("not JSON")
                  : Response.json({ userId: id }),
              );
      vi.stubGlobal("fetch", fetcher);
      const response = await invokeBoundary(operation);
      expect(response.status).toBe(503);
      expect((await response.json()).code).toBe("CLIENT_PRINCIPAL_UNVERIFIED");
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it("uses the captured token for both /me and domain even if the cookie changes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        if (new URL(String(url)).pathname === "/api/v1/auth/me") {
          auth.readAccessToken.mockResolvedValue("MOCK_ONLY_switched_B");
          return Response.json(currentUser);
        }
        return domainResponse(operation);
      }),
    );
    const response = await invokeBoundary(operation, id.toUpperCase());
    expect(response.status).toBe(operation === "POST" ? 202 : 200);
    expect(auth.readAccessToken).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [, init] of vi.mocked(fetch).mock.calls) {
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer server-cookie-token",
      );
      expect(init?.cache).toBe("no-store");
    }
    const [, forwarded] = vi.mocked(fetch).mock.calls[1];
    if (operation === "POST") {
      expect(new Headers(forwarded?.headers).get("Idempotency-Key")).toBe(id);
      expect(JSON.parse(String(forwarded?.body))).toEqual({
        requestedFor: payload.requestedFor,
        customerNote: "prueba",
        items: payload.items,
      });
    }
  });
});
