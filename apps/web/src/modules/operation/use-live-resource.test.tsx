import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { testOrder } from "@/data/fixtures/operational-api-test";
import { isOrderSummaries } from "@/modules/orders/live-contract";
import { useLiveResource } from "./use-live-resource";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("polls for server state and reads persisted state on remount", async () => {
  vi.useFakeTimers();
  let status = "SENT";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json([{ ...testOrder, status }])),
  );
  const first = renderHook(() =>
    useLiveResource("/bff/operational/orders", isOrderSummaries, true),
  );
  await act(async () => {});
  expect(first.result.current.data?.[0].status).toBe("SENT");
  status = "READY";
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15000);
  });
  expect(first.result.current.data?.[0].status).toBe("READY");
  first.unmount();
  const second = renderHook(() =>
    useLiveResource("/bff/operational/orders", isOrderSummaries, true),
  );
  await act(async () => {});
  expect(second.result.current.data?.[0].status).toBe("READY");
});
it("discards a late response when filters change", async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            finish = r;
          }),
      )
      .mockResolvedValueOnce(Response.json([])),
  );
  const view = renderHook(({ url }) => useLiveResource(url, isOrderSummaries), {
    initialProps: { url: "/bff/operational/orders" },
  });
  view.rerender({ url: "/bff/operational/orders?status=READY" });
  await act(async () => {});
  await act(async () => {
    finish(Response.json([testOrder]));
  });
  expect(view.result.current.data).toEqual([]);
});
it("does not expose browser network diagnostics", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("private network diagnostic")),
  );
  const view = renderHook(() =>
    useLiveResource("/bff/operational/orders", isOrderSummaries),
  );
  await act(async () => {});
  expect(view.result.current.error).toBe(
    "No pudimos cargar los datos. Intenta actualizar.",
  );
});
