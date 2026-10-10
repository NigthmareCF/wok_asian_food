import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FinancialAttemptProvider } from "@/modules/payments/financial-attempt-provider";
import { useLiveCashSession } from "./use-live-cash-session";
const user = "10000000-0000-4000-8000-000000000001",
  a = "20000000-0000-4000-8000-000000000001",
  b = "30000000-0000-4000-8000-000000000001";
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <FinancialAttemptProvider userId={user} permissions={["cash:manage"]}>
    {children}
  </FinancialAttemptProvider>
);
const session = (id = a, version = 1) => ({
  id,
  rowVersion: version,
  status: "OPEN",
  currency: "GTQ",
  registerCode: "MAIN",
  expectedCash: 100,
  breakdown: {
    opening: 100,
    sales: 0,
    tips: 0,
    otherIncome: 0,
    expenses: 0,
    withdrawals: 0,
    expectedCash: 100,
  },
  movements: [],
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});
it.each(["turn", "version"])(
  "revalidates %s after asynchronous session validation and never redirects the close",
  async (change) => {
    let current = session(),
      posts: string[] = [];
    let resolve!: (response: Response) => void;
    let authStarted = false;
    const auth = new Promise<Response>((done) => {
      resolve = done;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/bff/auth/session") {
          authStarted = true;
          return auth;
        }
        if (init?.method === "POST") {
          posts.push(url);
          return Response.json(current);
        }
        return Response.json(current);
      }),
    );
    const h = renderHook(() => useLiveCashSession("MAIN"), { wrapper });
    await waitFor(() => expect(h.result.current.session?.id).toBe(a));
    let closing!: Promise<boolean>;
    act(() => {
      closing = h.result.current.close(a, 100, 1);
    });
    await waitFor(() => expect(authStarted).toBe(true));
    if (change === "turn") {
      current = session(b);
      act(() => h.result.current.newTurn());
      await waitFor(() => expect(h.result.current.session?.id).toBe(b));
    } else {
      current = session(a, 2);
      await act(() => h.result.current.refresh());
    }
    await act(async () => {
      resolve(
        Response.json({ user: { userId: user, permissions: ["cash:manage"] } }),
      );
      expect(await closing).toBe(false);
    });
    expect(posts).toHaveLength(0);
    expect(h.result.current.error).toContain("conteo");
  },
);
it("rejects a count from another turn before any asynchronous session request", async () => {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      return Response.json(session());
    }),
  );
  const h = renderHook(() => useLiveCashSession("MAIN"), { wrapper });
  await waitFor(() => expect(h.result.current.session?.id).toBe(a));
  await act(async () => {
    expect(await h.result.current.close(b, 100, 1)).toBe(false);
  });
  expect(calls).not.toContain("/bff/auth/session");
  expect(h.result.current.error).toContain("conteo");
});
