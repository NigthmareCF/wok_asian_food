import { renderHook, act, cleanup } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { useSubmission } from "./use-submission";
import {
  parseMessage,
  isMessageReceipt,
} from "@/modules/messaging/live-contract";
const receipt = {
  messageId: "11111111-1111-4111-8111-111111111111",
  status: "SENT",
  createdAt: "2026-10-02T20:00:00Z",
  idempotentReplay: true,
};
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const mount = (key = "client:conversation") =>
  renderHook(() =>
    useSubmission(key, "/bff/messages", parseMessage, isMessageReceipt),
  );
it("reuses payload and key after a lost response and remount", async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new Error("lost"))
    .mockResolvedValueOnce(Response.json(receipt));
  vi.stubGlobal("fetch", fetcher);
  const first = mount();
  await act(async () => {
    await first.result.current.send({ body: "Consulta original" });
  });
  expect(first.result.current.error).toContain("Reintenta");
  first.unmount();
  const second = mount();
  await act(async () => {
    await second.result.current.send({
      body: "No debe reemplazar el original",
    });
  });
  expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[0][1].body);
  expect(fetcher.mock.calls[1][1].headers["Idempotency-Key"]).toBe(
    fetcher.mock.calls[0][1].headers["Idempotency-Key"],
  );
  expect(second.result.current.attempt?.receipt).toEqual(receipt);
});
it("does not send when session storage is unavailable", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("denied");
  });
  vi.stubGlobal("fetch", vi.fn());
  const hook = mount();
  await act(async () => {
    await hook.result.current.send({ body: "hola" });
  });
  expect(fetch).not.toHaveBeenCalled();
  expect(hook.result.current.error).toContain("almacenamiento");
});
it("isolates attempts by user and conversation", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("lost")));
  const first = mount();
  await act(async () => {
    await first.result.current.send({ body: "privado" });
  });
  first.unmount();
  const second = mount("other:conversation");
  expect(second.result.current.attempt).toBeNull();
});
it("allows correction only on validation rejection", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(Response.json({ message: "Revisa" }, { status: 400 })),
  );
  const hook = mount();
  await act(async () => {
    await hook.result.current.send({ body: "hola" });
  });
  expect(hook.result.current.attempt).toBeNull();
});
