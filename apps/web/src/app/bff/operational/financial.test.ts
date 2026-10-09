// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "./accounts/[accountId]/payments/route";
import { GET as confirmed } from "./accounts/[accountId]/payments/by-idempotency-key/[key]/route";
import { GET as list } from "./accounts/route";
import { POST as close } from "./cash-sessions/[sessionId]/close/route";
const auth = vi.hoisted(() => ({
  readAccessToken: vi.fn(),
  loadCurrentUser: vi.fn(),
}));
vi.mock("@/modules/auth/server/auth-cookies", () => auth);
vi.mock("@/modules/auth/server/backend-auth", () => auth);
const id = "11111111-1111-4111-8111-111111111111",
  key = "22222222-2222-4222-8222-222222222222";
const receipt = {
  paymentId: key,
  accountId: id,
  accountStatus: "OPEN",
  amount: 10,
  tipAmount: 0,
  currency: "GTQ",
  method: "CASH",
  status: "CAPTURED",
  balance: 20,
  idempotentReplay: false,
};
function request(
  body: unknown = { method: "CASH", amount: 10 },
  headers: Record<string, string> = {},
) {
  return new NextRequest(
    "http://localhost/bff/operational/accounts/" + id + "/payments",
    {
      method: "POST",
      headers: {
        origin: "http://localhost",
        host: "localhost",
        "Content-Type": "application/json",
        "Idempotency-Key": key,
        "X-Request-Id": key,
        "X-Financial-Actor": id,
        ...headers,
      },
      body: JSON.stringify(body),
    },
  );
}
const context = { params: Promise.resolve({ accountId: id }) };
beforeEach(() => {
  auth.readAccessToken.mockResolvedValue("fictional-test-session");
  auth.loadCurrentUser.mockResolvedValue({ userId: id });
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("forwards the original payment key and amount without creating a new key", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json(receipt, { status: 201 }));
  expect((await POST(request(), context)).status).toBe(201);
  const [url, options] = vi.mocked(fetch).mock.calls[0];
  expect(String(url)).toContain(`/operational/accounts/${id}/payments`);
  expect((options?.headers as Record<string, string>)["Idempotency-Key"]).toBe(
    key,
  );
  expect(JSON.parse(String(options?.body))).toEqual({
    method: "CASH",
    amount: 10,
  });
});
it.each([401, 403, 404, 409, 422])(
  "preserves financial rejection %s",
  async (status) => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ message: "upstream" }, { status }),
    );
    const response = await POST(request(), context);
    expect(response.status).toBe(status);
    expect((await response.json()).message).not.toContain("horario");
  },
);
it("blocks a foreign origin before calling API", async () => {
  expect(
    (await POST(request(undefined, { origin: "http://foreign.test" }), context))
      .status,
  ).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});
it("blocks a missing session", async () => {
  auth.readAccessToken.mockResolvedValue(null);
  expect((await POST(request(), context)).status).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
});
it("rejects fractional cents and stored sensitive references", async () => {
  expect(
    (await POST(request({ method: "TRANSFER", amount: 10.005 }), context))
      .status,
  ).toBe(400);
  expect(
    (
      await POST(
        request({ method: "TRANSFER", amount: 10, reference: "sensitive" }),
        context,
      )
    ).status,
  ).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});
it("marks timeout and malformed/wrong-account responses uncertain", async () => {
  vi.mocked(fetch).mockRejectedValueOnce(new Error("timeout"));
  expect((await POST(request(), context)).status).toBe(503);
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({ ...receipt, accountId: key }, { status: 201 }),
  );
  expect((await POST(request(), context)).status).toBe(503);
});
it("confirmation is read-only and 404 does not fabricate success", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({ message: "pending" }, { status: 404 }),
  );
  const response = await confirmed(
    new NextRequest("http://localhost/bff/test", {
      headers: { "X-Financial-Actor": id },
    }),
    { params: Promise.resolve({ accountId: id, key }) },
  );
  expect(response.status).toBe(404);
  expect(vi.mocked(fetch).mock.calls[0][1]?.method).toBe("GET");
});
it("does not replay an attempt under a different authenticated operator", async () => {
  auth.loadCurrentUser.mockResolvedValue({ userId: key });
  expect((await POST(request(), context)).status).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});
it("preserves an expired actor check as 401 without reaching the payment API", async () => {
  auth.loadCurrentUser.mockRejectedValue({ status: 401 });
  expect((await POST(request(), context)).status).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
});
it("validates a table filter rather than consulting the order list", async () => {
  expect(
    (await list(new NextRequest("http://localhost/bff/test?tableId=bad")))
      .status,
  ).toBe(400);
  vi.mocked(fetch).mockResolvedValue(Response.json([]));
  expect(
    (
      await list(
        new NextRequest("http://localhost/bff/test?tableId=" + id, {
          headers: { "X-Financial-Actor": id },
        }),
      )
    ).status,
  ).toBe(200);
  expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain(
    "operational/accounts?tableId=" + id,
  );
});
it("forwards the count's original version and explains stale counts", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({}, { status: 409 }));
  const response = await close(
    request({ countedCash: 100, expectedVersion: 3 }),
    { params: Promise.resolve({ sessionId: id }) },
  );
  expect(
    JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)).expectedVersion,
  ).toBe(3);
  expect((await response.json()).message).toContain("vuelve a contar");
});

import { GET as durableHistory } from "./payment-attempts/route";
import {
  GET as scopedHistory,
  POST as prepareDurable,
} from "./accounts/[accountId]/payment-attempts/route";
import { GET as contextDurable } from "./accounts/[accountId]/payment-attempts/context/route";
import { GET as bridgeDurable } from "./accounts/[accountId]/payment-attempts/by-legacy-key/[key]/route";
import { GET as getDurable } from "./accounts/[accountId]/payment-attempts/[attemptId]/route";
import { POST as captureDurable } from "./accounts/[accountId]/payment-attempts/[attemptId]/capture/route";
import { POST as retireDurable } from "./accounts/[accountId]/payment-attempts/[attemptId]/retire/route";
import { POST as replaceDurable } from "./accounts/[accountId]/payment-attempts/[attemptId]/replacement/route";
import {
  GET as reviewDurable,
  POST as resolveDurable,
} from "./accounts/[accountId]/payment-attempts/[attemptId]/resolution/route";
import { GET as queueDurable } from "./payment-attempt-resolutions/route";
it("composes all ten durable routes while keeping existing legacy cases separate", async () => {
  auth.loadCurrentUser.mockResolvedValue({
    userId: id,
    permissions: ["payments:manage", "payments:resolve"],
  });
  const prepared = {
    attemptId: key,
    accountId: id,
    version: 1,
    status: "PREPARED",
    amount: 10,
    tipAmount: 0,
    currency: "GTQ",
    method: "TRANSFER",
    registerCode: "MAIN",
    availableActions: ["CAPTURE", "RETIRE"],
  };
  const pending = {
    ...prepared,
    version: 2,
    status: "PENDING",
    executionRequestedAt: "2026-10-06T18:00:00Z",
    availableActions: ["CONTINUE_SAME_ATTEMPT"],
  };
  const retired = {
    ...pending,
    version: 3,
    status: "RETIRED",
    availableActions: [],
    resolution: {
      actorId: id,
      resolvedAt: "2026-10-06T18:00:00Z",
      reason: "No recibido",
      evidenceSummary: "Evidencia ficticia",
      expectedVersion: 2,
      physicalReceiptStatus: "NOT_RECEIVED",
    },
  };
  const scope = {
    params: Promise.resolve({ accountId: id, attemptId: key, key }),
  };
  const read = () =>
    new NextRequest("http://localhost/bff/test", {
      headers: { "X-Financial-Actor": id },
    });
  const write = (body: unknown) => {
    const r = request(body);
    r.headers.delete("Idempotency-Key");
    return r;
  };
  const cases: [() => Promise<Response>, unknown, string, string][] = [
    [
      () => durableHistory(read()),
      { items: [prepared], blockedByAnotherOperator: false },
      "payment-attempts",
      "GET",
    ],
    [
      () => scopedHistory(read(), scope),
      { items: [prepared], blockedByAnotherOperator: false },
      "accounts/" + id + "/payment-attempts",
      "GET",
    ],
    [
      () =>
        prepareDurable(
          write({
            method: "TRANSFER",
            amount: 10,
            tipAmount: 0,
            currency: "GTQ",
          }),
          scope,
        ),
      prepared,
      "payment-attempts",
      "POST",
    ],
    [
      () => contextDurable(read(), scope),
      {
        accountId: id,
        canPrepare: false,
        ownActiveAttempt: prepared,
        blockedByAnotherOperator: false,
      },
      "/context",
      "GET",
    ],
    [
      () => bridgeDurable(read(), scope),
      prepared,
      "/by-legacy-key/" + key,
      "GET",
    ],
    [() => getDurable(read(), scope), prepared, "/" + key, "GET"],
    [
      () => captureDurable(write({ expectedVersion: 1 }), scope),
      pending,
      "/capture",
      "POST",
    ],
    [
      () =>
        retireDurable(
          write({ expectedVersion: 1, reason: "Nunca solicitado" }),
          scope,
        ),
      { ...prepared, status: "RETIRED", version: 2, availableActions: [] },
      "/retire",
      "POST",
    ],
    [
      () =>
        replaceDurable(
          write({
            expectedVersion: 3,
            reason: "Corregir",
            payment: {
              method: "TRANSFER",
              amount: 10,
              tipAmount: 0,
              currency: "GTQ",
              expectedPreviousAttemptId: key,
            },
          }),
          scope,
        ),
      { ...prepared, attemptId: id, previousAttemptId: key },
      "/replacement",
      "POST",
    ],
    [
      () => reviewDurable(read(), scope),
      {
        ownerUserId: key,
        attempt: pending,
        registeredCapture: false,
        claimState: "ABSENT",
        availableActions: ["RETIRE_WITH_EVIDENCE"],
      },
      "/resolution",
      "GET",
    ],
    [
      () =>
        resolveDurable(
          write({
            expectedVersion: 2,
            reason: "No recibido",
            evidenceSummary: "Evidencia ficticia",
            physicalReceiptStatus: "NOT_RECEIVED",
          }),
          scope,
        ),
      {
        ownerUserId: key,
        attempt: retired,
        registeredCapture: false,
        claimState: "ABSENT",
        availableActions: [],
      },
      "/resolution",
      "POST",
    ],
    [
      () => queueDurable(read()),
      { items: [] },
      "payment-attempt-resolutions",
      "GET",
    ],
  ];
  for (const [invoke, dto, path, method] of cases) {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(dto));
    const response = await invoke();
    expect(response.status).toBe(200);
    const [url, init] = vi.mocked(fetch).mock.calls.at(-1)!;
    expect(String(url)).toContain(path);
    expect(init?.method).toBe(method);
    expect(new Headers(init?.headers).has("Idempotency-Key")).toBe(false);
  }
});
