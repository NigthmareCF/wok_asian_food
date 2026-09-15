import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pendingRequestFixture } from "@/data/fixtures/pending-request";
import { usePendingRequest } from "./use-pending-request";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Pending request", () => {
  it("keeps one request and never confirms after repeated waits", () => {
    const { result } = renderHook(usePendingRequest);
    act(() => {
      result.current.beginPendingRequest("highDemand");
      result.current.beginPendingRequest();
    });
    expect(result.current.pendingRequest?.status).toBe("highDemand");
    act(() => {
      result.current.waitForPendingRequest();
      result.current.waitForPendingRequest();
    });
    expect(vi.getTimerCount()).toBe(1);
    act(() => result.current.requestPendingNotice());
    act(() => vi.advanceTimersByTime(pendingRequestFixture.retryDelayMs));
    expect(result.current.pendingRequest).toEqual({
      status: "pendingConfirmation",
      waiting: false,
      noticeRequested: true,
    });
  });

  it("cancels an outstanding retry without resurrecting the abandoned request", () => {
    const { result, unmount } = renderHook(usePendingRequest);
    act(() => {
      result.current.beginPendingRequest();
      result.current.waitForPendingRequest();
    });
    act(() => result.current.cancelPendingRequest());
    act(() => vi.runAllTimers());
    expect(result.current.pendingRequest).toBeNull();
    act(() => {
      result.current.beginPendingRequest("highDemand");
      result.current.waitForPendingRequest();
    });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retains the request offline and requires an explicit retry after reconnecting", () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const { result } = renderHook(usePendingRequest);
    act(() => result.current.beginPendingRequest());
    online.mockReturnValue(false);
    act(() => window.dispatchEvent(new Event("offline")));
    expect(result.current.pendingRequest?.status).toBe("offline");
    act(() => result.current.waitForPendingRequest());
    expect(result.current.pendingRequest?.status).toBe("reconnecting");
    act(() => vi.runAllTimers());
    expect(result.current.pendingRequest?.status).toBe("offline");
    online.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    expect(result.current.pendingRequest?.status).toBe("offline");
    act(() => result.current.waitForPendingRequest());
    act(() => vi.runAllTimers());
    expect(result.current.pendingRequest?.status).toBe("pendingConfirmation");
  });
});
