import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useAutomaticRefresh } from "./use-automatic-refresh";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("consulta periódicamente, recupera conexión y elimina listeners al cerrar", () => {
  vi.useFakeTimers();
  const refresh = vi.fn();
  const hook = renderHook(() => useAutomaticRefresh(refresh));
  act(() => {
    vi.advanceTimersByTime(10000);
  });
  expect(refresh).toHaveBeenCalledTimes(1);
  act(() => {
    window.dispatchEvent(new Event("online"));
  });
  expect(refresh).toHaveBeenCalledTimes(2);
  hook.unmount();
  act(() => {
    vi.advanceTimersByTime(10000);
    window.dispatchEvent(new Event("online"));
  });
  expect(refresh).toHaveBeenCalledTimes(2);
});
it("no consulta en segundo plano con la pestaña oculta", () => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  const refresh = vi.fn();
  renderHook(() => useAutomaticRefresh(refresh));
  act(() => {
    vi.advanceTimersByTime(30000);
  });
  expect(refresh).not.toHaveBeenCalled();
});
