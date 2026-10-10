import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  FinancialAttemptProvider,
  attemptPrefix,
  legacyAttemptPrefix,
} from "./financial-attempt-provider";
import { useAccountFinance } from "./use-account-finance";
import type { DurableAttempt, PreparationInput } from "./attempt-contract";
const user = "10000000-0000-4000-8000-000000000001",
  account = "20000000-0000-4000-8000-000000000001",
  id = "30000000-0000-4000-8000-000000000001",
  other = "40000000-0000-4000-8000-000000000001",
  date = "2026-10-06T18:00:00Z",
  permissions = ["payments:manage", "payments:resolve"];
const details = {
  account: {
    id: account,
    name: "F04B ficticia",
    status: "OPEN",
    diningTableId: null,
    diningTableName: null,
    rowVersion: 1,
  },
  total: 100,
  paid: 0,
  balance: 100,
  tips: 0,
  currencies: ["GTQ"],
  currencyTotals: [
    { currency: "GTQ", total: 100, paid: 0, balance: 100, tips: 0 },
  ],
  pendingOrderCount: 0,
  unfinalizedOrderCount: 1,
  orders: [],
  payments: [],
};
const input: PreparationInput = {
  method: "TRANSFER",
  amount: 30,
  tipAmount: 0,
  currency: "GTQ",
  expectedPreviousAttemptId: null,
};
const make = (): DurableAttempt => ({
  attemptId: id,
  accountId: account,
  version: 1,
  status: "PREPARED",
  amount: 30,
  tipAmount: 0,
  currency: "GTQ",
  method: "TRANSFER",
  registerCode: "MAIN",
  availableActions: ["CAPTURE", "RETIRE"],
});
let rows: DurableAttempt[],
  posts: { url: string; body: Record<string, unknown>; headers: Headers }[],
  lost: string | null,
  lookupStatus: number,
  sessionUser: string,
  blockedOther: boolean,
  ownerId: string;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <FinancialAttemptProvider userId={user} permissions={permissions}>
    {children}
  </FinancialAttemptProvider>
);
function review(row: DurableAttempt) {
  return {
    ownerUserId: ownerId,
    attempt: row,
    registeredCapture: row.status === "CONFIRMED",
    claimState: row.status === "CONFIRMED" ? "COMPLETED" : "ABSENT",
    availableActions:
      row.status === "PENDING" && ownerId !== user
        ? ["RETIRE_WITH_EVIDENCE"]
        : [],
  };
}
beforeEach(() => {
  history.replaceState(null, "", "/");
  sessionStorage.clear();
  rows = [];
  posts = [];
  lost = null;
  lookupStatus = 200;
  sessionUser = user;
  blockedOther = false;
  ownerId = user;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/bff/auth/session")
        return Response.json({ user: { userId: sessionUser, permissions } });
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        posts.push({ url, body, headers: new Headers(init.headers) });
        if (url.endsWith("/capture")) {
          rows[0] = {
            ...rows[0],
            status: "CONFIRMED",
            version: 3,
            executionRequestedAt: date,
            availableActions: [],
            confirmation: {
              paymentId: other,
              amount: rows[0].amount,
              tipAmount: 0,
              currency: "GTQ",
              method: "TRANSFER",
              capturedAt: date,
            },
            receiptAvailability: "AVAILABLE",
            balance: 70,
          };
        } else if (url.endsWith("/resolution")) {
          rows[0] = {
            ...rows[0],
            status: "RETIRED",
            version: 3,
            availableActions: [],
            resolution: {
              actorId: user,
              resolvedAt: date,
              reason: body.reason,
              evidenceSummary: body.evidenceSummary,
              expectedVersion: 2,
              physicalReceiptStatus: "NOT_RECEIVED",
            },
          };
        } else if (url.endsWith("/replacement")) {
          rows.unshift({
            ...make(),
            attemptId: other,
            previousAttemptId: id,
            amount: body.payment.amount,
          });
        } else if (url.endsWith("/retire")) {
          rows[0] = {
            ...rows[0],
            status: "RETIRED",
            version: 2,
            availableActions: [],
          };
        } else rows = [make()];
        if (lost && url.endsWith(lost)) {
          lost = null;
          throw Error("Lost response");
        }
        return Response.json(
          url.endsWith("/resolution") ? review(rows[0]) : rows[0],
        );
      }
      if (url.includes("by-legacy-key"))
        return rows.length
          ? Response.json(rows[0])
          : Response.json({ message: "No durable attempt" }, { status: 404 });
      if (url.includes("by-idempotency-key"))
        return Response.json({ message: "No record" }, { status: 404 });
      if (url.endsWith("/context")) {
        const active = rows.find((r) =>
          ["PREPARED", "PENDING"].includes(r.status),
        );
        return Response.json({
          accountId: account,
          canPrepare: !active && !blockedOther,
          expectedPreviousAttemptId:
            !active && rows.length ? rows[0].attemptId : null,
          ownActiveAttempt: !blockedOther ? active : null,
          blockedByAnotherOperator: blockedOther,
        });
      }
      if (url.endsWith("/resolution")) return Response.json(review(rows[0]));
      if (url.includes("/payment-attempts/")) {
        if (lookupStatus !== 200)
          return Response.json(
            { message: "Resultado no consultable" },
            { status: lookupStatus },
          );
        return rows.length
          ? Response.json(
              rows.find((r) => url.endsWith(r.attemptId)) ?? { invalid: true },
            )
          : Response.json({ message: "404" }, { status: 404 });
      }
      if (url.includes("/payment-attempts"))
        return Response.json({
          items: blockedOther ? [] : rows,
          blockedByAnotherOperator: blockedOther,
        });
      return Response.json({
        ...details,
        account: { ...details.account, id: url.split("/").at(-1) },
      });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function mount() {
  const h = renderHook(() => useAccountFinance(account), { wrapper });
  await waitFor(() => expect(h.result.current.context).toBeTruthy());
  return h;
}
it("mount, focus, reload and recovery only read, with no legacy fallback or generated capture key", async () => {
  rows = [make()];
  const h = await mount();
  act(() => window.dispatchEvent(new Event("focus")));
  await act(() => h.result.current.recover());
  expect(posts).toEqual([]);
  expect(
    vi.mocked(fetch).mock.calls.every(([, o]) => o?.method !== "POST"),
  ).toBe(true);
  expect(h.result.current.attempt?.attemptId).toBe(id);
});
it("prepares immutable explicit amount and captures only after a separate action", async () => {
  const h = await mount();
  await act(() => h.result.current.prepare(input));
  expect(posts).toHaveLength(1);
  expect(posts[0].body).toEqual(input);
  expect(h.result.current.attempt?.status).toBe("PREPARED");
  await act(() => h.result.current.capture(h.result.current.attempt!));
  expect(posts).toHaveLength(2);
  expect(posts[1].body).toEqual({ expectedVersion: 1 });
  expect(posts[1].headers.has("Idempotency-Key")).toBe(false);
  expect(h.result.current.attempt?.confirmation?.paymentId).toBe(other);
});
it("lost preparation response recovers the server attempt without another prepare/capture", async () => {
  lost = "/payment-attempts";
  const h = await mount();
  await act(() => h.result.current.prepare(input));
  expect(h.result.current.blocked).toBe(true);
  await act(() => h.result.current.recover());
  expect(h.result.current.attempt?.attemptId).toBe(id);
  expect(posts).toHaveLength(1);
  expect(posts[0].url).not.toContain("/payments");
});
it("lost capture response, reload and erased storage preserve confirmed evidence without another capture", async () => {
  const h = await mount();
  await act(() => h.result.current.prepare(input));
  lost = "/capture";
  await act(() => h.result.current.capture(h.result.current.attempt!));
  expect(h.result.current.blocked).toBe(true);
  sessionStorage.clear();
  h.unmount();
  const next = await mount();
  expect(next.result.current.attempt?.status).toBe("CONFIRMED");
  expect(next.result.current.attempt?.confirmation?.paymentId).toBe(other);
  expect(posts).toHaveLength(2);
});
it("valid substituted storage selection never replaces the canonical active server operation", async () => {
  rows = [make()];
  sessionStorage.setItem(
    attemptPrefix + user + ":" + account,
    JSON.stringify({
      v: 2,
      userId: user,
      accountId: account,
      attemptId: other,
    }),
  );
  const h = await mount();
  expect(h.result.current.attempt?.attemptId).toBe(id);
  expect(posts).toHaveLength(0);
});
it("storage failures still allow server recovery and no mounting capture", async () => {
  rows = [make()];
  sessionStorage.setItem("fixture", "x");
  vi.spyOn(Storage.prototype, "key").mockImplementation(() => {
    throw Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw Error("blocked");
  });
  const h = await mount();
  expect(h.result.current.attempt?.attemptId).toBe(id);
  expect(posts).toHaveLength(0);
});
it.each([404, 409, 422, 500])(
  "lookup %s does not enable replacement or clear an uncertain attempt",
  async (status) => {
    rows = [
      {
        ...make(),
        version: 2,
        status: "PENDING",
        executionRequestedAt: date,
        availableActions: ["CONTINUE_SAME_ATTEMPT"],
      },
    ];
    const h = await mount();
    lookupStatus = status;
    await act(() => h.result.current.capture(h.result.current.attempt!));
    expect(h.result.current.blocked).toBe(true);
    await act(() =>
      h.result.current.replace(
        { ...input, expectedPreviousAttemptId: id },
        "Corregir",
      ),
    );
    expect(posts).toHaveLength(0);
    expect(h.result.current.attempt?.status).toBe("PENDING");
  },
);
it("a durable rejection has guided authorized replacement but no automatic capture", async () => {
  rows = [
    {
      ...make(),
      version: 3,
      status: "REJECTED",
      executionRequestedAt: date,
      rejectionStatus: 409,
      rejectionMessage: "Caja cerrada",
      availableActions: ["REPLACE"],
    },
  ];
  const h = await mount();
  await act(() =>
    h.result.current.replace(
      { ...input, amount: 20, expectedPreviousAttemptId: id },
      "Transferencia confirmada",
    ),
  );
  expect(posts).toHaveLength(1);
  expect(posts[0].url).toContain(id + "/replacement");
  expect(posts[0].body.reason).toBe("Transferencia confirmada");
  expect(h.result.current.attempt?.status).toBe("PREPARED");
});
it("HTTP200 PENDING is not payment confirmation", async () => {
  rows = [make()];
  const h = await mount();
  const original = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (init?.method === "POST") {
      rows = [
        {
          ...make(),
          version: 2,
          status: "PENDING",
          executionRequestedAt: date,
          availableActions: ["CONTINUE_SAME_ATTEMPT"],
        },
      ];
      posts.push({ url: String(url), body: {}, headers: new Headers() });
      return Response.json(rows[0]);
    }
    return original(url, init);
  });
  await act(() => h.result.current.capture(h.result.current.attempt!));
  expect(h.result.current.attempt?.status).toBe("PENDING");
  expect(h.result.current.feedback).not.toContain("Pago confirmado");
});
it("an anomalous confirmed account preserves its evidence and no replacement", async () => {
  rows = [
    {
      ...make(),
      status: "CONFIRMED",
      version: 3,
      executionRequestedAt: date,
      availableActions: [],
      confirmation: {
        paymentId: other,
        amount: 30,
        tipAmount: 0,
        currency: "GTQ",
        method: "TRANSFER",
        capturedAt: date,
      },
      receiptAvailability: "RECONCILIATION_REQUIRED",
    },
  ];
  const h = await mount();
  await act(() => h.result.current.recover());
  expect(h.result.current.attempt?.confirmation?.paymentId).toBe(other);
  await act(() =>
    h.result.current.replace({ ...input, expectedPreviousAttemptId: id }, "No"),
  );
  expect(posts).toHaveLength(0);
});
it("serializes double clicks before first awaited session verification", async () => {
  const h = await mount();
  await act(() =>
    Promise.all([
      h.result.current.prepare(input),
      h.result.current.prepare(input),
    ]),
  );
  expect(posts).toHaveLength(1);
});
it("another operator's active attempt prevents preparation and exposes no foreign content", async () => {
  blockedOther = true;
  rows = [make()];
  const h = await mount();
  expect(h.result.current.canPrepare).toBe(false);
  expect(h.result.current.attempt).toBeNull();
  await act(() => h.result.current.prepare(input));
  expect(posts).toHaveLength(0);
});
it("two independent tabs consult the same server attempt and never automatically post", async () => {
  rows = [make()];
  const a = await mount(),
    b = await mount();
  expect(a.result.current.attempt?.attemptId).toBe(
    b.result.current.attempt?.attemptId,
  );
  act(() => window.dispatchEvent(new Event("focus")));
  await act(() =>
    Promise.all([a.result.current.recover(), b.result.current.recover()]),
  );
  expect(posts).toHaveLength(0);
});
it("legacy v1 hint is bridged by GET only, without replaying manipulated payload", async () => {
  rows = [make()];
  rows[0] = { ...rows[0], status: "RETIRED", version: 2, availableActions: [] };
  sessionStorage.setItem(
    legacyAttemptPrefix + user + ":" + account,
    JSON.stringify({
      v: 1,
      userId: user,
      accountId: account,
      key: other,
      payload: { amount: 999 },
    }),
  );
  const h = await mount();
  await act(() => h.result.current.recover());
  expect(posts).toHaveLength(0);
  expect(
    vi
      .mocked(fetch)
      .mock.calls.some(([url]) => String(url).includes("by-legacy-key")),
  ).toBe(true);
});
it("legacy404 never causes POST fallback or fabricates a recovered identity", async () => {
  sessionStorage.setItem(
    legacyAttemptPrefix + user + ":" + account,
    JSON.stringify({ v: 1, userId: user, accountId: account, key: other }),
  );
  const h = await mount();
  expect(h.result.current.error).toContain("Requiere revisión");
  expect(h.result.current.attempt).toBeNull();
  expect(posts).toHaveLength(0);
});
it("logout during awaited session check prevents preparation", async () => {
  const h = await mount();
  let release!: (r: Response) => void;
  const original = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation((url, init) =>
    url === "/bff/auth/session"
      ? new Promise((r) => {
          release = r;
        })
      : original(url, init),
  );
  const sending = h.result.current.prepare(input);
  await waitFor(() => expect(release).toBeTruthy());
  act(() => window.dispatchEvent(new Event("wok:logout")));
  release(Response.json({ user: { userId: user, permissions } }));
  await act(() => sending);
  expect(posts).toHaveLength(0);
  expect(h.result.current.ready).toBe(false);
});
it("account changed during await never sends preparation to the stale or new destination", async () => {
  const h = renderHook(({ target }) => useAccountFinance(target), {
    wrapper,
    initialProps: { target: account },
  });
  await waitFor(() => expect(h.result.current.context).toBeTruthy());
  let release!: (r: Response) => void;
  const original = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation((url, init) =>
    url === "/bff/auth/session"
      ? new Promise((r) => {
          release = r;
        })
      : original(url, init),
  );
  const sending = h.result.current.prepare(input);
  await waitFor(() => expect(release).toBeTruthy());
  h.rerender({ target: other });
  release(Response.json({ user: { userId: user, permissions } }));
  await act(() => sending);
  expect(posts).toHaveLength(0);
  expect(h.result.current.data?.account.id).not.toBe(account);
});
it("fresh server session operator mismatch rejects capture without changing the durable attempt", async () => {
  rows = [make()];
  const h = await mount();
  sessionUser = other;
  await act(() => h.result.current.capture(h.result.current.attempt!));
  expect(posts).toHaveLength(0);
  expect(h.result.current.error).toContain("sesión");
});
it("lost resolution response is recovered by query, keeps marker and never implies account paid", async () => {
  history.replaceState(null, "", "/?reviewAttempt=" + id);
  ownerId = other;
  rows = [
    {
      ...make(),
      status: "PENDING",
      version: 2,
      executionRequestedAt: date,
      availableActions: ["CONTINUE_SAME_ATTEMPT"],
    },
  ];
  const h = await mount();
  await waitFor(() => expect(h.result.current.review).toBeTruthy());
  lost = "/resolution";
  await act(() =>
    h.result.current.resolve(
      {
        expectedVersion: 2,
        reason: "No recibido",
        evidenceSummary: "Revisado físicamente",
        physicalReceiptStatus: "NOT_RECEIVED",
      },
      rows[0],
    ),
  );
  expect(h.result.current.blocked).toBe(true);
  await act(() => h.result.current.recover());
  expect(h.result.current.review?.attempt.status).toBe("RETIRED");
  expect(h.result.current.review?.attempt.executionRequestedAt).toBe(date);
  expect(h.result.current.data?.balance).toBe(100);
  expect(posts).toHaveLength(1);
});
it("self-resolution never posts even when both permissions are present", async () => {
  history.replaceState(null, "", "/?reviewAttempt=" + id);
  rows = [
    {
      ...make(),
      status: "PENDING",
      version: 2,
      executionRequestedAt: date,
      availableActions: ["CONTINUE_SAME_ATTEMPT"],
    },
  ];
  const h = await mount();
  await act(() =>
    h.result.current.resolve(
      {
        expectedVersion: 2,
        reason: "No",
        evidenceSummary: "No",
        physicalReceiptStatus: "NOT_RECEIVED",
      },
      rows[0],
    ),
  );
  expect(posts).toHaveLength(0);
});
it("invalid DTO cannot authorize replacement or turn HTTP200 into evidence", async () => {
  rows = [make()];
  const h = await mount();
  const original = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation((url, init) =>
    init?.method === "POST"
      ? Promise.resolve(Response.json({ status: "CONFIRMED" }))
      : original(url, init),
  );
  await act(() => h.result.current.capture(h.result.current.attempt!));
  expect(h.result.current.blocked).toBe(true);
  expect(h.result.current.attempt?.confirmation).toBeUndefined();
});

it("pinned ADMIN review only queries exceptional data and rejects operator actions", async () => {
  ownerId = other;
  rows = [
    {
      ...make(),
      status: "PENDING",
      version: 2,
      executionRequestedAt: date,
      availableActions: ["CONTINUE_SAME_ATTEMPT"],
    },
  ];
  history.replaceState(
    null,
    "",
    "/admin/payment-attempts/" + account + "?reviewAttempt=" + id,
  );
  const h = renderHook(() => useAccountFinance(account, id), { wrapper });
  await waitFor(() => expect(h.result.current.review).toBeTruthy());
  expect(h.result.current.administrative).toBe(true);
  expect(h.result.current.canPrepare).toBe(false);
  expect(h.result.current.history).toEqual([]);
  expect(
    vi
      .mocked(fetch)
      .mock.calls.some(([url]) => String(url).endsWith("/context")),
  ).toBe(false);
  await act(() => h.result.current.prepare(input));
  expect(posts).toHaveLength(0);
  expect(h.result.current.error).toContain("administrativa");
});
it("changed URL cannot silently retarget a pinned ADMIN review", async () => {
  ownerId = other;
  rows = [make()];
  history.replaceState(
    null,
    "",
    "/admin/payment-attempts/" + account + "?reviewAttempt=" + id,
  );
  const h = renderHook(() => useAccountFinance(account, id), { wrapper });
  await waitFor(() => expect(h.result.current.review).toBeTruthy());
  history.replaceState(
    null,
    "",
    "/admin/payment-attempts/" + account + "?reviewAttempt=" + other,
  );
  await act(() => h.result.current.recover());
  expect(h.result.current.blocked).toBe(true);
  expect(h.result.current.review?.attempt.attemptId).toBe(id);
  expect(posts).toHaveLength(0);
});

it("native network failure after confirmed capture remains explicitly uncertain in Spanish, recovery does not recapture", async () => {
  rows = [make()];
  const h = await mount();
  const original = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    const reply = await original(url, init);
    if (init?.method === "POST" && String(url).endsWith("/capture"))
      throw new TypeError("Failed to fetch");
    return reply;
  });
  await act(() => h.result.current.capture(rows[0]));
  expect(h.result.current.error).toContain("Resultado incierto");
  expect(h.result.current.error).not.toContain("Failed to fetch");
  expect(h.result.current.blocked).toBe(true);
  await act(() => h.result.current.recover());
  expect(h.result.current.attempt?.status).toBe("CONFIRMED");
  expect(posts).toHaveLength(1);
});
