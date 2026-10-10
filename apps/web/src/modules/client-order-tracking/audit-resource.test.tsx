import { installPrivateSession } from "@/test/private-session-fixture";
import { act, renderHook, waitFor, cleanup } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { usePickupResource } from "./use-pickup-resource";
const valid = (x: unknown): x is string[] => Array.isArray(x);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("AUDIT: operational data must disappear on logout", async () => {
  installPrivateSession(
    vi.fn().mockResolvedValue(Response.json(["staff A private order"])),
  );
  const hook = renderHook(() =>
    usePickupResource("/bff/operational/orders", valid, 10000),
  );
  await waitFor(() =>
    expect(hook.result.current.data).toEqual(["staff A private order"]),
  );
  act(() => window.dispatchEvent(new Event("wok:logout")));
  expect(hook.result.current.data).toBeNull();
});
it("AUDIT: generic read aborts on unmount", async () => {
  let signal: AbortSignal | undefined;
  installPrivateSession(
    vi.fn((_url, init) => {
      signal = init.signal;
      return new Promise<Response>(() => {});
    }),
  );
  const hook = renderHook(() =>
    usePickupResource("/bff/operational/orders", valid, 10000),
  );
  await waitFor(() => expect(signal).toBeDefined());
  hook.unmount();
  expect(signal?.aborted).toBe(true);
});

it("descarta una lectura anterior despu?s de cambiar identidad aunque ignore abort", async () => {
  let owner = "40000000-0000-4000-8000-000000000001",
    resolve!: (r: Response) => void;
  const old = new Promise<Response>((r) => (resolve = r));
  const transport = vi
    .fn()
    .mockReturnValueOnce(old)
    .mockResolvedValue(Response.json(["B private"]));
  installPrivateSession(transport, () => owner);
  const hook = renderHook(() =>
    usePickupResource("/bff/operational/orders", valid, 10000),
  );
  await waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
  owner = "50000000-0000-4000-8000-000000000001";
  act(() => window.dispatchEvent(new Event("focus")));
  expect(hook.result.current.data).toBeNull();
  await waitFor(() => expect(hook.result.current.data).toEqual(["B private"]));
  await act(async () => resolve(Response.json(["A private"])));
  expect(hook.result.current.data).toEqual(["B private"]);
});
it("el refresco autom?tico cancela la consulta anterior y descarta su respuesta", async () => {
  let resolve!: (r: Response) => void;
  const old = new Promise<Response>((r) => (resolve = r));
  const transport = vi
    .fn()
    .mockReturnValueOnce(old)
    .mockResolvedValue(Response.json(["current"]));
  installPrivateSession(transport);
  const hook = renderHook(() =>
    usePickupResource("/bff/operational/orders", valid, 10000),
  );
  await waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
  const signal = transport.mock.calls[0][1].signal;
  act(() => window.dispatchEvent(new Event("online")));
  await waitFor(() => expect(hook.result.current.data).toEqual(["current"]));
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(Response.json(["old"])));
  expect(hook.result.current.data).toEqual(["current"]);
});
