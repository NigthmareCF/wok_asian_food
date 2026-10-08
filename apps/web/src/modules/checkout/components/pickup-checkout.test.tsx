import { clientIdentityStore } from "@/modules/clients/client-identity-store";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveCartProvider } from "@/modules/cart/live-cart-provider";
import { createLiveCartStore } from "@/modules/cart/live-cart-storage";
import { createPickupAttemptStore } from "../pickup-attempt";
import { PickupCheckout } from "./pickup-checkout";

const id = "11111111-1111-4111-8111-111111111111";
const product = {
  id,
  name: "Gyozas",
  price: 68,
  currency: "GTQ",
  estimatedPreparationSeconds: 300,
};
const menu = {
  asOf: new Date().toISOString(),
  categories: [{ id, name: "Platos", items: [product] }],
};
const date = "2026-10-04T20:20";
const receipt = {
  requestId: id,
  status: "PENDING_REVIEW",
  requestedFor: new Date(date).toISOString(),
  subtotal: 68,
  currency: "GTQ",
  idempotentReplay: false,
};
const renderCheckout = () =>
  render(
    <LiveCartProvider>
      <PickupCheckout userId="client-test" />
    </LiveCartProvider>,
  );
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-04T20:00:00-06:00"));
});

describe("pickup checkout", () => {
  it("submits API identifiers, displays the real pending receipt and clears only submitted cart lines", async () => {
    createLiveCartStore().add(product);
    const fetcher = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        Response.json(url === "/bff/menu" ? menu : receipt, {
          status: url === "/bff/menu" ? 200 : 202,
        }),
      ),
    );
    installFetch("fetch", fetcher);
    const user = userEvent.setup();
    renderCheckout();
    await screen
      .findByText("Subtotal estimado: Q 68.00", { exact: false })
      .catch(() => screen.findByText(/Subtotal estimado/));
    fireEvent.change(screen.getByLabelText("Fecha y hora para recoger"), {
      target: { value: date },
    });
    await user.click(
      screen.getByRole("button", { name: "Enviar solicitud para recoger" }),
    );
    expect(await screen.findByText("Solicitud registrada")).toBeInTheDocument();
    expect(screen.getByText("Pendiente de revisión")).toBeInTheDocument();
    expect(createLiveCartStore().getSnapshot()).toEqual([]);
    const sent = fetcher.mock.calls.find(
      (call) => call[0] === "/bff/order-requests",
    )!;
    expect(JSON.parse(sent[1].body)).toEqual({
      requestedFor: receipt.requestedFor,
      customerNote: "",
      items: [{ menuItemId: id, quantity: 1 }],
    });
    expect(JSON.parse(sent[1].body)).not.toHaveProperty("subtotal");
    expect(sent[1].headers["X-Wok-Expected-Principal"]).toBe("client-test");
  });

  it("reuses the exact key and payload after a lost response and reload", async () => {
    createLiveCartStore().add(product);
    let posts = 0;
    const fetcher = vi.fn().mockImplementation((url: string) => {
      if (url === "/bff/menu") return Promise.resolve(Response.json(menu));
      posts++;
      return posts === 1
        ? Promise.reject(new Error("lost response"))
        : Promise.resolve(
            Response.json(
              { ...receipt, idempotentReplay: true },
              { status: 202 },
            ),
          );
    });
    installFetch("fetch", fetcher);
    const user = userEvent.setup();
    const view = renderCheckout();
    await screen.findByText(/Subtotal estimado/);
    fireEvent.change(screen.getByLabelText("Fecha y hora para recoger"), {
      target: { value: date },
    });
    await user.click(
      screen.getByRole("button", { name: "Enviar solicitud para recoger" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Conservamos tu solicitud",
    );
    view.unmount();
    renderCheckout();
    await user.click(
      await screen.findByRole("button", {
        name: "Reintentar la misma solicitud",
      }),
    );
    expect(await screen.findByText("Solicitud registrada")).toBeInTheDocument();
    const requests = fetcher.mock.calls.filter(
      (call) => call[0] === "/bff/order-requests",
    );
    expect(requests).toHaveLength(2);
    expect(requests[0][1].headers["Idempotency-Key"]).toBe(
      requests[1][1].headers["Idempotency-Key"],
    );
    expect(requests[0][1].body).toBe(requests[1][1].body);
    expect(requests[0][1].headers["X-Wok-Expected-Principal"]).toBe(
      "client-test",
    );
    expect(requests[1][1].headers["X-Wok-Expected-Principal"]).toBe(
      "client-test",
    );
    expect(
      createPickupAttemptStore("different-client").getSnapshot(),
    ).toBeNull();
  });

  it.each(
    [400, 422].flatMap((status) =>
      [false, true].flatMap((reload) =>
        ["lost", "invalid-json", "invalid-receipt", "unavailable"].map(
          (outcome) => ({ status, reload, outcome }),
        ),
      ),
    ),
  )(
    "keeps key and payload after $outcome then $status (reload=$reload)",
    async ({ status, reload, outcome }) => {
      createLiveCartStore().add(product);
      const random = vi.spyOn(crypto, "randomUUID").mockReturnValue(id);
      const storageKey = "wok.pickup.attempt.v1:client-test";
      let posts = 0;
      const fetcher = vi.fn(async (url: RequestInfo | URL, _options?: RequestInit) => {
        if (url === "/bff/menu") return Response.json(menu);
        posts++;
        if (posts === 1) {
          if (outcome === "lost") throw new Error("lost response");
          if (outcome === "invalid-json") return new Response("{", { status: 202 });
          if (outcome === "invalid-receipt") return Response.json({}, { status: 202 });
          return Response.json({ message: "MOCK_ONLY unavailable" }, { status: 503 });
        }
        if (posts === 2)
          return Response.json({ message: "MOCK_ONLY rejection" }, { status });
        return Response.json({ ...receipt, idempotentReplay: true }, { status: 202 });
      });
      installFetch("fetch", fetcher);
      const user = userEvent.setup();
      let view = renderCheckout();
      await screen.findByText(/Subtotal estimado/);
      fireEvent.change(screen.getByLabelText("Fecha y hora para recoger"), {
        target: { value: date },
      });
      await user.click(screen.getByRole("button", { name: "Enviar solicitud para recoger" }));
      await screen.findByRole("alert");
      const raw = sessionStorage.getItem(storageKey);
      expect(raw).not.toBeNull();
      const saved = JSON.parse(raw!);
      expect(createLiveCartStore().getSnapshot()).toHaveLength(1);
      if (reload) {
        view.unmount();
        view = renderCheckout();
        await screen.findByRole("button", { name: "Reintentar la misma solicitud" });
        await act(async () => { await vi.advanceTimersByTimeAsync(250); });
        expect(posts).toBe(1);
        expect(createPickupAttemptStore("client-test").getSnapshot()).toMatchObject(saved);
      }
      await user.click(screen.getByRole("button", { name: "Reintentar la misma solicitud" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("MOCK_ONLY rejection");
      expect(sessionStorage.getItem(storageKey)).toBe(raw);
      expect(createLiveCartStore().getSnapshot()).toHaveLength(1);
      expect(screen.queryByLabelText("Fecha y hora para recoger")).not.toBeInTheDocument();
      if (reload) {
        view.unmount();
        view = renderCheckout();
      }
      const retry = await screen.findByRole("button", { name: "Reintentar la misma solicitud" });
      await act(async () => { await vi.advanceTimersByTimeAsync(250); });
      expect(posts).toBe(2);
      expect(sessionStorage.getItem(storageKey)).toBe(raw);
      await user.click(retry);
      expect(await screen.findByText("Solicitud registrada")).toBeInTheDocument();
      const requests = fetcher.mock.calls.filter(([url]) => url === "/bff/order-requests");
      expect(requests).toHaveLength(3);
      for (const [, options] of requests) {
        expect(new Headers(options?.headers).get("Idempotency-Key")).toBe(saved.key);
        expect(options?.body).toBe(JSON.stringify(saved.payload));
      }
      expect(random).toHaveBeenCalledTimes(1);
      expect(createLiveCartStore().getSnapshot()).toEqual([]);
    },
  );

  it("persists the send marker before a pending POST and preserves it across reload", async () => {
    createLiveCartStore().add(product);
    let finishFirst!: (response: Response) => void;
    let posts = 0;
    const fetcher = vi.fn(async (url: RequestInfo | URL, _options?: RequestInit) => {
      if (url === "/bff/menu") return Response.json(menu);
      posts++;
      if (posts === 1) return new Promise<Response>((resolve) => { finishFirst = resolve; });
      if (posts === 2) return Response.json({ message: "MOCK_ONLY rejection" }, { status: 422 });
      return Response.json({ ...receipt, idempotentReplay: true }, { status: 202 });
    });
    installFetch("fetch", fetcher);
    const user = userEvent.setup();
    const view = renderCheckout();
    await screen.findByText(/Subtotal estimado/);
    fireEvent.change(screen.getByLabelText("Fecha y hora para recoger"), { target: { value: date } });
    await user.click(screen.getByRole("button", { name: "Enviar solicitud para recoger" }));
    expect(posts).toBe(1);
    const saved = createPickupAttemptStore("client-test").getSnapshot();
    expect(saved?.mayHaveBeenSent).toBe(true);
    const raw = sessionStorage.getItem("wok.pickup.attempt.v1:client-test");
    view.unmount();
    await act(async () => { finishFirst(Response.json({}, { status: 202 })); });
    renderCheckout();
    const retry = await screen.findByRole("button", { name: "Reintentar la misma solicitud" });
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    expect(posts).toBe(1);
    await user.click(retry);
    expect(await screen.findByRole("alert")).toHaveTextContent("MOCK_ONLY rejection");
    expect(sessionStorage.getItem("wok.pickup.attempt.v1:client-test")).toBe(raw);
    await user.click(screen.getByRole("button", { name: "Reintentar la misma solicitud" }));
    expect(await screen.findByText("Solicitud registrada")).toBeInTheDocument();
    const requests = fetcher.mock.calls.filter(([url]) => url === "/bff/order-requests");
    expect(requests).toHaveLength(3);
    for (const [, options] of requests) {
      expect(new Headers(options?.headers).get("Idempotency-Key")).toBe(saved?.key);
      expect(options?.body).toBe(JSON.stringify(saved?.payload));
    }
  });

  it("does not POST if persisting the send marker fails", async () => {
    createLiveCartStore().add(product);
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === "wok.pickup.attempt.v1:client-test" && JSON.parse(value).mayHaveBeenSent === true)
        throw new Error("MOCK_ONLY storage failure");
      return setItem.call(this, key, value);
    });
    const fetcher = vi.fn(async () => Response.json(menu));
    installFetch("fetch", fetcher);
    const user = userEvent.setup();
    renderCheckout();
    await screen.findByText(/Subtotal estimado/);
    fireEvent.change(screen.getByLabelText("Fecha y hora para recoger"), { target: { value: date } });
    await user.click(screen.getByRole("button", { name: "Enviar solicitud para recoger" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Conservamos tu solicitud");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(createPickupAttemptStore("client-test").getSnapshot()?.mayHaveBeenSent).toBe(false);
    expect(createLiveCartStore().getSnapshot()).toHaveLength(1);
  });

  it.each([400, 422])("allows correction after the first definitive %s rejection", async (status) => {
    createLiveCartStore().add(product);
    const nextId = "22222222-2222-4222-8222-222222222222";
    const random = vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(id).mockReturnValueOnce(nextId);
    let posts = 0;
    const fetcher = vi.fn(async (url: RequestInfo | URL, _options?: RequestInit) => {
      if (url === "/bff/menu") return Response.json(menu);
      posts++;
      return posts === 1
        ? Response.json({ message: "MOCK_ONLY rejection" }, { status })
        : Response.json(receipt, { status: 202 });
    });
    installFetch("fetch", fetcher);
    const user = userEvent.setup();
    renderCheckout();
    await screen.findByText(/Subtotal estimado/);
    fireEvent.change(screen.getByLabelText("Fecha y hora para recoger"), { target: { value: date } });
    await user.click(screen.getByRole("button", { name: "Enviar solicitud para recoger" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("MOCK_ONLY rejection");
    expect(createPickupAttemptStore("client-test").getSnapshot()).toBeNull();
    expect(createLiveCartStore().getSnapshot()).toHaveLength(1);
    await user.type(screen.getByLabelText("Nota para el restaurante (opcional)"), "MOCK_ONLY corrected");
    await user.click(screen.getByRole("button", { name: "Enviar solicitud para recoger" }));
    expect(await screen.findByText("Solicitud registrada")).toBeInTheDocument();
    const requests = fetcher.mock.calls.filter(([url]) => url === "/bff/order-requests");
    expect(new Headers(requests[0][1]?.headers).get("Idempotency-Key")).toBe(id);
    expect(new Headers(requests[1][1]?.headers).get("Idempotency-Key")).toBe(nextId);
    expect(JSON.parse(requests[1][1]?.body as string).customerNote).toBe("MOCK_ONLY corrected");
    expect(random).toHaveBeenCalledTimes(2);
  });

  it("blocks past pickup times without sending or clearing the cart", async () => {
    createLiveCartStore().add(product);
    const fetcher = vi.fn().mockResolvedValue(Response.json(menu));
    installFetch("fetch", fetcher);
    renderCheckout();
    await screen.findByText(/Subtotal estimado/);
    fireEvent.change(screen.getByLabelText("Fecha y hora para recoger"), {
      target: { value: "2020-01-01T12:00" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Enviar solicitud para recoger" })
        .closest("form")!,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("próximas 3 horas");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(createLiveCartStore().getSnapshot()).toHaveLength(1);
  });

  it.each(["saved", "new"])(
    "preserves a %s attempt, blocks submit until manual reload and recovers only on explicit retry",
    async (kind) => {
      const saved = {
        key: id,
        payload: {
          requestedFor: receipt.requestedFor,
          customerNote: "MOCK_ONLY saved attempt",
          items: [{ menuItemId: id, quantity: 1 }],
        },
      };
      if (kind === "saved") createPickupAttemptStore("client-test").save(saved);
      else createLiveCartStore().add(product);
      const random = vi.spyOn(crypto, "randomUUID").mockReturnValue(id);
      let posts = 0;
      const fetcher = vi.fn(async (url: RequestInfo | URL, _options?: RequestInit) => {
        if (url === "/bff/menu") return Response.json(menu);
        posts++;
        return posts === 1
          ? Response.json(
              { code: "CLIENT_UPDATE_REQUIRED", message: "MOCK_ONLY server message" },
              { status: 409 },
            )
          : Response.json({ ...receipt, idempotentReplay: true }, { status: 202 });
      });
      installFetch("fetch", fetcher);
      const view = renderCheckout();
      const user = userEvent.setup();
      if (kind === "new") {
        await screen.findByText(/Subtotal estimado/);
        fireEvent.change(screen.getByLabelText("Fecha y hora para recoger"), {
          target: { value: date },
        });
      }
      const submit = await screen.findByRole("button", {
        name: kind === "saved"
          ? "Reintentar la misma solicitud"
          : "Enviar solicitud para recoger",
      });
      const storageKey = "wok.pickup.attempt.v1:client-test";
      const before = sessionStorage.getItem(storageKey);
      await user.click(submit);
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Actualiza esta pestaña para continuar. No cierres la pestaña ni borres sus datos. Después, reintenta la misma solicitud.",
      );
      const raw = sessionStorage.getItem(storageKey);
      expect(raw).not.toBeNull();
      if (kind === "saved") expect(raw).toBe(before);
      const attempt = createPickupAttemptStore("client-test").getSnapshot();
      expect(attempt?.receipt).toBeUndefined();
      const retry = screen.getByRole("button", { name: "Reintentar la misma solicitud" });
      expect(retry).toBeDisabled();
      expect(clientIdentityStore.getSnapshot().status).toBe("verified");
      fireEvent.submit(retry.closest("form")!);
      await act(async () => { await vi.advanceTimersByTimeAsync(250); });
      expect(posts).toBe(1);
      expect(sessionStorage.getItem(storageKey)).toBe(raw);
      expect(random).toHaveBeenCalledTimes(kind === "saved" ? 0 : 1);

      const reload = vi.fn();
      const originalWindow = window;
      vi.stubGlobal("window", new Proxy(originalWindow, {
        get(target, property) {
          return property === "location" ? { reload } : Reflect.get(target, property, target);
        },
      }));
      expect(reload).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Actualizar esta pestaña" }));
      expect(reload).toHaveBeenCalledTimes(1);
      expect(posts).toBe(1);
      expect(sessionStorage.getItem(storageKey)).toBe(raw);
      vi.stubGlobal("window", originalWindow);

      // El remontaje modela la recarga; el navegador y la caché no se prueban aquí.
      view.unmount();
      renderCheckout();
      const recoveredRetry = await screen.findByRole("button", { name: "Reintentar la misma solicitud" });
      await act(async () => { await vi.advanceTimersByTimeAsync(250); });
      expect(posts).toBe(1);
      expect(sessionStorage.getItem(storageKey)).toBe(raw);
      expect(recoveredRetry).toBeEnabled();
      await user.click(recoveredRetry);
      expect(await screen.findByText("Solicitud registrada")).toBeInTheDocument();
      const requests = fetcher.mock.calls.filter(([url]) => url === "/bff/order-requests");
      expect(requests).toHaveLength(2);
      const sent = requests;
      expect(sent[0][1]?.body).toBe(sent[1][1]?.body);
      expect(new Headers(sent[0][1]?.headers).get("Idempotency-Key")).toBe(attempt?.key);
      expect(new Headers(sent[1][1]?.headers).get("Idempotency-Key")).toBe(attempt?.key);
      expect(random).toHaveBeenCalledTimes(kind === "saved" ? 0 : 1);
    },
  );

  it.each([400, 422, 409, 503])(
    "conservatively preserves legacy attempts without update UI for status %s",
    async (status) => {
      const saved = {
        key: id,
        payload: {
          requestedFor: receipt.requestedFor,
          customerNote: "MOCK_ONLY domain error",
          items: [{ menuItemId: id, quantity: 1 }],
        },
      };
      createPickupAttemptStore("client-test").save(saved);
      const raw = sessionStorage.getItem("wok.pickup.attempt.v1:client-test");
      const fetcher = vi.fn(async (url: RequestInfo | URL) =>
        url === "/bff/menu"
          ? Response.json(menu)
          : Response.json({ message: "MOCK_ONLY domain error", ...(status === 503 ? { code: "CLIENT_UPDATE_REQUIRED" } : {}) }, { status }),
      );
      installFetch("fetch", fetcher);
      renderCheckout();
      fireEvent.click(await screen.findByRole("button", { name: "Reintentar la misma solicitud" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("MOCK_ONLY domain error");
      expect(sessionStorage.getItem("wok.pickup.attempt.v1:client-test")).toBe(
        raw,
      );
      expect(screen.queryByRole("button", { name: "Actualizar esta pestaña" })).not.toBeInTheDocument();
      if (status === 409) {
        const retry = screen.getByRole("button", { name: "Reintentar la misma solicitud" });
        expect(retry).toBeEnabled();
        fireEvent.click(retry);
        await act(async () => { await vi.advanceTimersByTimeAsync(250); });
        expect(fetcher.mock.calls.filter(([url]) => url === "/bff/order-requests")).toHaveLength(2);
        expect(sessionStorage.getItem("wok.pickup.attempt.v1:client-test")).toBe(raw);
      }
    },
  );

  it.each([
    [409, "CLIENT_PRINCIPAL_CHANGED"],
    [503, "CLIENT_PRINCIPAL_UNVERIFIED"],
  ] as const)(
    "keeps the saved attempt and blocks actions on identity boundary %s",
    async (status, code) => {
      const saved = {
        key: id,
        payload: {
          requestedFor: receipt.requestedFor,
          customerNote: "MOCK_ONLY A",
          items: [{ menuItemId: id, quantity: 1 }],
        },
      };
      createPickupAttemptStore("client-test").save(saved);
      const fetcher = vi.fn(async (url: RequestInfo | URL) =>
        url === "/bff/menu"
          ? Response.json(menu)
          : Response.json({ code, message: "MOCK_ONLY blocked" }, { status }),
      );
      installFetch("fetch", fetcher);
      renderCheckout();
      const user = userEvent.setup();
      await user.click(
        await screen.findByRole("button", {
          name: "Reintentar la misma solicitud",
        }),
      );
      expect(
        await screen.findByText("Verifica tu sesión para continuar."),
      ).toBeInTheDocument();
      expect(clientIdentityStore.getSnapshot().status).toBe("unverified");
      expect(createPickupAttemptStore("client-test").getSnapshot()).toEqual(
        saved,
      );
      expect(
        screen.queryByText("Solicitud registrada"),
      ).not.toBeInTheDocument();
      const posts = fetcher.mock.calls.filter(
        ([url]) => url === "/bff/order-requests",
      );
      expect(posts).toHaveLength(1);
    },
  );
});

function installFetch(_name: string, fetcher: typeof fetch) {
  vi.stubGlobal("fetch", (url: RequestInfo | URL, options?: RequestInit) =>
    url === "/bff/auth/session"
      ? Promise.resolve(Response.json({ user: { userId: "client-test" } }))
      : fetcher(url, options),
  );
}
beforeEach(async () => {
  installFetch("fetch", vi.fn());
  await clientIdentityStore.refresh();
});
