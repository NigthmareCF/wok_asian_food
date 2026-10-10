import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  FinancialAttemptProvider,
  attemptPrefix,
  legacyAttemptPrefix,
  parseAttempt,
  useFinancialAttempts,
} from "./financial-attempt-provider";
const user = "10000000-0000-4000-8000-000000000001",
  account = "20000000-0000-4000-8000-000000000001",
  other = "30000000-0000-4000-8000-000000000001",
  permissions = ["payments:manage"];
const reference = { v: 2, userId: user, accountId: account, attemptId: other };
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <FinancialAttemptProvider userId={user} permissions={permissions}>
    {children}
  </FinancialAttemptProvider>
);
beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ user: { userId: user, permissions } })),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("v2 contains only server selection identity, never financial payload or capture key", () => {
  expect(parseAttempt(reference, user, account)).toEqual(reference);
  expect(
    parseAttempt({ ...reference, payload: { amount: 10 } }, user, account),
  ).toBeNull();
  expect(parseAttempt({ ...reference, key: other }, user, account)).toBeNull();
  expect(parseAttempt(reference, other, account)).toBeNull();
});
it("storage selection does not create an attempt or financial request", async () => {
  const h = renderHook(useFinancialAttempts, { wrapper });
  await waitFor(() => expect(h.result.current.ready).toBe(true));
  act(() => h.result.current.select(account, other));
  expect(
    JSON.parse(sessionStorage.getItem(attemptPrefix + user + ":" + account)!),
  ).toEqual(reference);
  expect(fetch).not.toHaveBeenCalled();
});
it("ignores corrupt storage and remains ready to consult the server", async () => {
  sessionStorage.setItem(attemptPrefix + user + ":" + account, "invalid");
  const h = renderHook(useFinancialAttempts, { wrapper });
  await waitFor(() => expect(h.result.current.ready).toBe(true));
  expect(h.result.current.selections).toEqual({});
  expect(h.result.current.storageNotice).toContain("servidor");
  await h.result.current.ensureSession();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("unavailable storage neither blocks server consultation nor loses durable server identity", async () => {
  vi.spyOn(Storage.prototype, "key").mockImplementation(() => {
    throw Error("Blocked");
  });
  sessionStorage.setItem("fictitious", "x");
  const h = renderHook(useFinancialAttempts, { wrapper });
  await waitFor(() => expect(h.result.current.ready).toBe(true));
  await h.result.current.ensureSession();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw Error("Blocked");
  });
  act(() => h.result.current.select(account, other));
  expect(h.result.current.selections[account]).toEqual(reference);
});
it("reads only an old key hint without trusting or replaying its payload", async () => {
  sessionStorage.setItem(
    legacyAttemptPrefix + user + ":" + account,
    JSON.stringify({
      v: 1,
      userId: user,
      accountId: account,
      key: other,
      payload: { amount: 999999, method: "CASH" },
    }),
  );
  const h = renderHook(useFinancialAttempts, { wrapper });
  await waitFor(() => expect(h.result.current.ready).toBe(true));
  expect(h.result.current.legacyHints[account]).toBe(other);
  expect(h.result.current.selections).toEqual({});
  expect(fetch).not.toHaveBeenCalled();
});
it("isolates another user's storage and fences logout without deleting server evidence", async () => {
  sessionStorage.setItem(
    attemptPrefix + other + ":" + account,
    JSON.stringify({ ...reference, userId: other }),
  );
  const h = renderHook(useFinancialAttempts, { wrapper });
  await waitFor(() => expect(h.result.current.ready).toBe(true));
  const ticket = h.result.current.identity();
  expect(h.result.current.selections).toEqual({});
  act(() => window.dispatchEvent(new Event("wok:logout")));
  expect(h.result.current.valid(ticket)).toBe(false);
  await expect(h.result.current.ensureSession()).rejects.toThrow("sesión");
  expect(sessionStorage.length).toBe(1);
});
it("fresh session permissions override buttons and require both exceptional authorities", async () => {
  const h = renderHook(useFinancialAttempts, { wrapper });
  await waitFor(() => expect(h.result.current.ready).toBe(true));
  await expect(
    h.result.current.ensureSession(["payments:manage", "payments:resolve"]),
  ).rejects.toThrow("permisos");
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({ user: { userId: other, permissions } }),
  );
  await expect(h.result.current.ensureSession()).rejects.toThrow("sesión");
});
it("rejects a session response that arrives after logout", async () => {
  let release!: (r: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(
    () =>
      new Promise((r) => {
        release = r;
      }),
  );
  const h = renderHook(useFinancialAttempts, { wrapper });
  await waitFor(() => expect(h.result.current.ready).toBe(true));
  const pending = h.result.current.ensureSession();
  act(() => window.dispatchEvent(new Event("wok:logout")));
  release(Response.json({ user: { userId: user, permissions } }));
  await expect(pending).rejects.toThrow("sesión");
  expect(h.result.current.ready).toBe(false);
});
