// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  attemptEndpoint,
  authorizeAdministrativePaymentPage,
} from "./attempt-endpoint";
const auth = vi.hoisted(() => ({
  readAccessToken: vi.fn(),
  loadCurrentUser: vi.fn(),
  currentSession: vi.fn(),
}));
vi.mock("@/modules/auth/server/auth-cookies", () => auth);
vi.mock("@/modules/auth/server/auth-session", () => auth);
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw Error("NEXT_NOT_FOUND");
  },
}));
import AdminListPage from "@/app/(private)/(admin)/admin/payment-attempts/page";
import AdminDetailPage from "@/app/(private)/(admin)/admin/payment-attempts/[accountId]/page";
vi.mock("@/modules/auth/server/backend-auth", () => auth);
const user = "10000000-0000-4000-8000-000000000001",
  account = "20000000-0000-4000-8000-000000000001",
  id = "30000000-0000-4000-8000-000000000001",
  date = "2026-10-06T18:00:00Z";
const row = {
  attemptId: id,
  accountId: account,
  version: 1,
  status: "PREPARED",
  amount: 10,
  tipAmount: 0,
  currency: "GTQ",
  method: "TRANSFER",
  registerCode: "MAIN",
  availableActions: ["CAPTURE", "RETIRE"],
};
const input = { amount: 10, tipAmount: 0, currency: "GTQ", method: "TRANSFER" };
function req(
  method = "GET",
  body: unknown = undefined,
  headers: Record<string, string> = {},
  query = "",
) {
  return new NextRequest("http://localhost/bff/test" + query, {
    method,
    headers: {
      host: "localhost",
      origin: "http://localhost",
      "X-Financial-Actor": user,
      "X-Request-Id": id,
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
beforeEach(() => {
  auth.currentSession.mockResolvedValue({
    userId: user,
    roles: ["ADMIN"],
    permissions: ["payments:manage", "payments:resolve"],
  });
  auth.readAccessToken.mockResolvedValue("fictitious-session");
  auth.loadCurrentUser.mockResolvedValue({
    userId: user,
    permissions: ["payments:manage", "payments:resolve"],
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(row)),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("preparation forwards explicit immutable content without Idempotency-Key", async () => {
  const r = await attemptEndpoint(req("POST", input), "prepare", {
    accountId: account,
  });
  expect(r.status).toBe(200);
  expect(r.headers.get("Cache-Control")).toBe("no-store");
  const [url, options] = vi.mocked(fetch).mock.calls[0];
  expect(String(url)).toContain(account + "/payment-attempts");
  expect(JSON.parse(String(options?.body))).toEqual(input);
  expect(new Headers(options?.headers).has("Idempotency-Key")).toBe(false);
});
it("normal consultation has no writes or backfill", async () => {
  expect(
    (await attemptEndpoint(req(), "legacy", { accountId: account, key: id }))
      .status,
  ).toBe(200);
  expect(vi.mocked(fetch).mock.calls[0][1]?.method).toBe("GET");
});
it.each([401, 403, 404, 409, 422, 500])(
  "preserves uncertainty of upstream%s without fallback",
  async (status) => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json(
        { message: "raw", code: "RECONCILIATION_REQUIRED" },
        { status },
      ),
    );
    const r = await attemptEndpoint(
      req("POST", { expectedVersion: 1 }),
      "capture",
      { accountId: account, attemptId: id },
    );
    expect(r.status).toBe(status === 500 ? 503 : status);
    expect((await r.json()).code).toBe("RECONCILIATION_REQUIRED");
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);
it.each([
  { permissions: [] },
  { permissions: ["payments:manage"] },
  { permissions: ["payments:resolve"] },
])(
  "exceptional routes require both current authorities %s",
  async ({ permissions }) => {
    auth.loadCurrentUser.mockResolvedValue({ userId: user, permissions });
    for (const operation of ["review", "queue"] as const)
      expect(
        (
          await attemptEndpoint(
            req(),
            operation,
            operation === "review" ? { accountId: account, attemptId: id } : {},
          )
        ).status,
      ).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  },
);
it("revocation and actor mismatch reach no capture API", async () => {
  auth.loadCurrentUser.mockResolvedValue({
    userId: id,
    permissions: ["payments:manage"],
  });
  expect(
    (
      await attemptEndpoint(req("POST", { expectedVersion: 1 }), "capture", {
        accountId: account,
        attemptId: id,
      })
    ).status,
  ).toBe(403);
  auth.loadCurrentUser.mockRejectedValue({ status: 401 });
  expect((await attemptEndpoint(req(), "history")).status).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
});
it("anonymous session and missing mutation origin are rejected", async () => {
  auth.readAccessToken.mockResolvedValue(null);
  expect((await attemptEndpoint(req(), "history")).status).toBe(401);
  const q = req("POST", input);
  q.headers.delete("origin");
  expect(
    (await attemptEndpoint(q, "prepare", { accountId: account })).status,
  ).toBe(403);
});
it("rejects foreign origin, invalid versions, legacy keys and fractional amounts", async () => {
  expect(
    (
      await attemptEndpoint(
        req("POST", input, { origin: "https://foreign.test" }),
        "prepare",
        { accountId: account },
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await attemptEndpoint(
        req("POST", { ...input, amount: 1.005 }),
        "prepare",
        { accountId: account },
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await attemptEndpoint(
        req("POST", input, { "Idempotency-Key": id }),
        "prepare",
        { accountId: account },
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await attemptEndpoint(req("POST", { expectedVersion: 0 }), "capture", {
        accountId: account,
        attemptId: id,
      })
    ).status,
  ).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});
it("rejects mismatched account/content, invalid DTO and timeout without claiming payment", async () => {
  for (const body of [
    { ...row, accountId: user },
    { ...row, amount: 11 },
    { ...row, captureKey: id },
    { status: "CONFIRMED" },
  ]) {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(body));
    expect(
      (
        await attemptEndpoint(req("POST", input), "prepare", {
          accountId: account,
        })
      ).status,
    ).toBe(503);
  }
  vi.mocked(fetch).mockRejectedValueOnce(Error("timeout"));
  expect(
    (await attemptEndpoint(req(), "get", { accountId: account, attemptId: id }))
      .status,
  ).toBe(503);
});
it("keeps anomalous confirmed payment evidence in a valid durable response", async () => {
  const confirmed = {
    ...row,
    status: "CONFIRMED",
    version: 3,
    executionRequestedAt: date,
    availableActions: [],
    confirmation: {
      paymentId: id,
      amount: 10,
      tipAmount: 0,
      currency: "GTQ",
      method: "TRANSFER",
      capturedAt: date,
    },
    receiptAvailability: "RECONCILIATION_REQUIRED",
  };
  vi.mocked(fetch).mockResolvedValue(Response.json(confirmed));
  const r = await attemptEndpoint(req(), "get", {
    accountId: account,
    attemptId: id,
  });
  expect(r.status).toBe(200);
  expect((await r.json()).confirmation.paymentId).toBe(id);
});
it("review queue cannot adopt normal cursor, foreign filter, unexpected fields or account responses", async () => {
  expect(
    (await attemptEndpoint(req("GET", undefined, {}, "?cursor=" + id), "queue"))
      .status,
  ).toBe(400);
  expect(
    (
      await attemptEndpoint(
        req("GET", undefined, {}, "?accountId=bad"),
        "queue",
      )
    ).status,
  ).toBe(400);
  vi.mocked(fetch).mockResolvedValue(
    Response.json({
      items: [
        {
          attemptId: id,
          accountId: user,
          ownerUserId: id,
          status: "PENDING",
          version: 2,
          createdAt: date,
        },
      ],
    }),
  );
  expect(
    (
      await attemptEndpoint(
        req("GET", undefined, {}, "?accountId=" + account),
        "queue",
      )
    ).status,
  ).toBe(503);
});
it.each(["RECEIVED", "UNKNOWN"])(
  "never forwards exceptional retirement for%s",
  async (physicalReceiptStatus) => {
    expect(
      (
        await attemptEndpoint(
          req("POST", {
            expectedVersion: 2,
            reason: "Reason",
            evidenceSummary: "Evidence",
            physicalReceiptStatus,
          }),
          "resolve",
          { accountId: account, attemptId: id },
        )
      ).status,
    ).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  },
);
it("rejects a fabricated self-resolution result even with an HTTP200", async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json({
      ownerUserId: user,
      attempt: {
        ...row,
        status: "RETIRED",
        version: 2,
        availableActions: [],
        resolution: {
          actorId: user,
          resolvedAt: date,
          reason: "Reason",
          evidenceSummary: "Evidence",
          expectedVersion: 1,
          physicalReceiptStatus: "NOT_RECEIVED",
        },
      },
      registeredCapture: false,
      claimState: "ABSENT",
      availableActions: [],
    }),
  );
  expect(
    (
      await attemptEndpoint(
        req("POST", {
          expectedVersion: 1,
          reason: "Reason",
          evidenceSummary: "Evidence",
          physicalReceiptStatus: "NOT_RECEIVED",
        }),
        "resolve",
        { accountId: account, attemptId: id },
      )
    ).status,
  ).toBe(503);
});

const pageReview = () => ({
  ownerUserId: account,
  attempt: row,
  registeredCapture: false,
  claimState: "ABSENT",
  availableActions: ["RETIRE_WITH_EVIDENCE"],
});
it("ADMIN pages authorize fresh server session and return only administrative components", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ items: [] }));
  const list = await AdminListPage();
  expect(list.props.children.props.administrativeOnly).toBe(true);
  vi.mocked(fetch).mockResolvedValueOnce(Response.json(pageReview()));
  const detail = await AdminDetailPage({
    params: Promise.resolve({ accountId: account }),
    searchParams: Promise.resolve({ reviewAttempt: id }),
  });
  expect(detail.props.children.props).toEqual({
    recordId: account,
    administrativeAttemptId: id,
  });
  expect(auth.currentSession).toHaveBeenCalledTimes(2);
  expect(
    vi
      .mocked(fetch)
      .mock.calls.every(([, init]) => !init?.method || init.method === "GET"),
  ).toBe(true);
});
it.each([
  null,
  {
    userId: user,
    roles: ["OPERATIONAL"],
    permissions: ["payments:manage", "payments:resolve"],
  },
  { userId: user, roles: ["ADMIN"], permissions: ["payments:manage"] },
  { userId: user, roles: ["ADMIN"], permissions: ["payments:resolve"] },
])(
  "ADMIN page rejects unauthorized server session before financial lookup: %j",
  async (session) => {
    auth.currentSession.mockResolvedValue(session);
    await expect(AdminListPage()).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(
      AdminDetailPage({
        params: Promise.resolve({ accountId: account }),
        searchParams: Promise.resolve({ reviewAttempt: id }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(fetch).not.toHaveBeenCalled();
  },
);
it.each([
  { accountId: "bad", search: { reviewAttempt: id } },
  { accountId: account, search: {} },
  { accountId: account, search: { reviewAttempt: [id, id] } },
  { accountId: account, search: { reviewAttempt: "bad" } },
  { accountId: account, search: { reviewAttempt: id, selectedAttempt: id } },
])("rejects malformed or ambiguous ADMIN destination: %j", async (target) => {
  await expect(authorizeAdministrativePaymentPage(target)).rejects.toThrow(
    "NEXT_NOT_FOUND",
  );
  expect(fetch).not.toHaveBeenCalled();
});
it.each([401, 403, 404])(
  "server page honors current API authorization/status %s",
  async (status) => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ message: "denied" }, { status }),
    );
    await expect(
      authorizeAdministrativePaymentPage({
        accountId: account,
        search: { reviewAttempt: id },
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  },
);
it("server page never adopts an attempt from a different account or ID", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({ ...pageReview(), attempt: { ...row, accountId: user } }),
  );
  await expect(
    authorizeAdministrativePaymentPage({
      accountId: account,
      search: { reviewAttempt: id },
    }),
  ).rejects.toThrow("NEXT_NOT_FOUND");
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({ ...pageReview(), attempt: { ...row, attemptId: user } }),
  );
  await expect(
    authorizeAdministrativePaymentPage({
      accountId: account,
      search: { reviewAttempt: id },
    }),
  ).rejects.toThrow("NEXT_NOT_FOUND");
});
it("invalid DTO and uncertain backend fail closed on ADMIN list/detail", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ invalid: true }));
  await expect(AdminListPage()).rejects.toThrow("inválida");
  await expect(
    authorizeAdministrativePaymentPage({
      accountId: account,
      search: { reviewAttempt: id },
    }),
  ).rejects.toThrow("NEXT_NOT_FOUND");
  vi.mocked(fetch).mockRejectedValue(Error("network"));
  await expect(AdminListPage()).rejects.toThrow("network");
});
