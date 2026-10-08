import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clientIdentityStore } from "./client-identity-store";
import { useEffect } from "react";
import {
  LiveCartProvider,
  useLiveCart,
} from "@/modules/cart/live-cart-provider";
import { createPickupAttemptStore } from "@/modules/checkout/pickup-attempt";
import { PickupCheckout } from "@/modules/checkout/components/pickup-checkout";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const P = "11111111-1111-4111-8111-111111111111",
  R = "22222222-2222-4222-8222-222222222222";
const product = {
  id: P,
  name: "Producto",
  price: 68,
  currency: "GTQ",
  estimatedPreparationSeconds: 60,
};
const payload = {
  requestedFor: "2026-10-06T21:00:00Z",
  customerNote: "Nota A",
  items: [{ menuItemId: P, quantity: 1 }],
};
const receipt = {
  requestId: R,
  status: "PENDING_REVIEW",
  requestedFor: payload.requestedFor,
  subtotal: 68,
  currency: "GTQ",
  idempotentReplay: false,
};
let owner: string | null;
let cart: ReturnType<typeof useLiveCart>;
function Probe() {
  const current = useLiveCart();
  useEffect(() => {
    cart = current;
  }, [current]);
  return <output>{current.items.map((item) => item.name).join(",")}</output>;
}
function Frame({ userId = A }: { userId?: string }) {
  return (
    <LiveCartProvider>
      <Probe />
      <PickupCheckout userId={userId} />
    </LiveCartProvider>
  );
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function mockFetch(post: () => Promise<Response>) {
  const fetcher = vi.fn((url: RequestInfo | URL, options?: RequestInit) => {
    if (url === "/bff/auth/session")
      return Promise.resolve(
        owner
          ? Response.json({ user: { userId: owner } })
          : Response.json({}, { status: 401 }),
      );
    if (url === "/bff/menu")
      return Promise.resolve(
        Response.json({
          asOf: payload.requestedFor,
          categories: [{ id: P, name: "Menú", items: [product] }],
        }),
      );
    if (url === "/bff/order-requests" && options?.method === "POST")
      return post();
    throw new Error("Unexpected mock route");
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
async function change(next: string | null) {
  owner = next;
  await act(async () => {
    await clientIdentityStore.refresh();
  });
}
beforeEach(() => {
  owner = A;
  sessionStorage.clear();
  clientIdentityStore.invalidate();
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

it.each(["receipt", "error", "json"])(
  "A to B to A rejects late %s with a new generation, preserving the uncertain attempt",
  async (stage) => {
    const late = deferred<Response>();
    const json = deferred<unknown>();
    const jsonStarted = vi.fn();
    const fetcher = mockFetch(() =>
      stage === "json"
        ? Promise.resolve({
            ok: true,
            status: 202,
            json: () => {
              jsonStarted();
              return json.promise;
            },
          } as Response)
        : late.promise,
    );
    createPickupAttemptStore(A).save({ key: P, payload });
    render(<Frame />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Reintentar la misma solicitud",
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Enviando/ })).toBeDisabled(),
    );
    await waitFor(() =>
      expect(
        fetcher.mock.calls.filter(([, options]) => options?.method === "POST"),
      ).toHaveLength(1),
    );
    if (stage === "json")
      await waitFor(() => expect(jsonStarted).toHaveBeenCalled());
    await change(B);
    await change(A);
    await screen.findByRole("button", {
      name: "Reintentar la misma solicitud",
    });
    act(() => {
      cart.add({ ...product, name: "Carrito nuevo de A" });
    });
    await act(async () => {
      if (stage === "receipt")
        late.resolve(Response.json(receipt, { status: 202 }));
      else if (stage === "error") late.reject(new Error("Late A error"));
      else json.resolve(receipt);
    });
    expect(cart.items).toHaveLength(1);
    expect(screen.queryByText("Solicitud registrada")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reintentar la misma solicitud" }),
    ).toBeEnabled();
    expect(createPickupAttemptStore(A).getSnapshot()?.key).toBe(P);
    expect(createPickupAttemptStore(A).getSnapshot()?.receipt).toBeUndefined();
  },
);

it("revalidates before POST even without a cross tab event; never submits A using B", async () => {
  const fetcher = mockFetch(async () =>
    Response.json(receipt, { status: 202 }),
  );
  createPickupAttemptStore(A).save({ key: P, payload });
  render(<Frame />);
  await screen.findByRole("button", { name: "Reintentar la misma solicitud" });
  owner = B;
  fireEvent.click(
    screen.getByRole("button", { name: "Reintentar la misma solicitud" }),
  );
  await waitFor(() =>
    expect(clientIdentityStore.getSnapshot().ownerId).toBe(B),
  );
  expect(
    fetcher.mock.calls.filter(([, options]) => options?.method === "POST"),
  ).toHaveLength(0);
  expect(createPickupAttemptStore(A).getSnapshot()?.key).toBe(P);
});

it("two subscribers share identity and a late verification after logout cannot revive it", async () => {
  const json = deferred<unknown>();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: () => json.promise })),
  );
  const { useClientIdentity } = await import("./use-client-identity");
  function Identity() {
    const { identity } = useClientIdentity();
    return <output>{identity.status}</output>;
  }
  const view = render(
    <>
      <Identity />
      <Identity />
    </>,
  );
  await act(async () => {});
  act(() => {
    window.dispatchEvent(new Event("wok:logout"));
  });
  await act(async () => {
    json.resolve({ user: { userId: A } });
  });
  expect(screen.getAllByText("unverified")).toHaveLength(2);
  view.unmount();
  const generation = clientIdentityStore.getSnapshot().generation;
  window.dispatchEvent(new Event("focus"));
  expect(clientIdentityStore.getSnapshot().generation).toBe(generation);
});

it("an old A failure cannot release B's pending POST or replace its errors", async () => {
  const a = deferred<Response>(),
    b = deferred<Response>();
  const fetcher = mockFetch(() => (owner === A ? a.promise : b.promise));
  createPickupAttemptStore(A).save({ key: P, payload });
  createPickupAttemptStore(B).save({
    key: R,
    payload: { ...payload, customerNote: "Nota B" },
  });
  const view = render(<Frame />);
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Reintentar la misma solicitud",
    }),
  );
  await waitFor(() =>
    expect(
      fetcher.mock.calls.filter(([, options]) => options?.method === "POST"),
    ).toHaveLength(1),
  );
  await change(B);
  view.rerender(<Frame userId={B} />);
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Reintentar la misma solicitud",
    }),
  );
  await waitFor(() =>
    expect(
      fetcher.mock.calls.filter(([, options]) => options?.method === "POST"),
    ).toHaveLength(2),
  );
  await act(async () => {
    a.reject(new Error("Late A failure"));
  });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Enviando solicitud…" }),
  ).toBeDisabled();
  await act(async () => {
    b.resolve(Response.json(receipt, { status: 202 }));
  });
  expect(await screen.findByText("Solicitud registrada")).toBeInTheDocument();
});

it.each([400, 401, 422])(
  "late POST %s from the old A generation cannot erase its uncertain attempt or invalidate the new A",
  async (status) => {
    const late = deferred<Response>();
    const fetcher = mockFetch(() => late.promise);
    createPickupAttemptStore(A).save({ key: P, payload });
    render(<Frame />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Reintentar la misma solicitud",
      }),
    );
    await waitFor(() =>
      expect(
        fetcher.mock.calls.filter(([, options]) => options?.method === "POST"),
      ).toHaveLength(1),
    );
    await change(B);
    await change(A);
    await screen.findByRole("button", {
      name: "Reintentar la misma solicitud",
    });
    const scope = clientIdentityStore.getSnapshot();
    await act(async () => {
      late.resolve(
        Response.json({ message: "Error antiguo de A" }, { status }),
      );
    });
    expect(clientIdentityStore.getSnapshot()).toEqual(scope);
    expect(createPickupAttemptStore(A).getSnapshot()?.key).toBe(P);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  },
);
