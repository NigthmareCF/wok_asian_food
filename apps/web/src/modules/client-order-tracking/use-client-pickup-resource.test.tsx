import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clientIdentityStore } from "@/modules/clients/client-identity-store";
import { PickupHistory } from "./components/pickup-history";
import { PickupRequestDetail } from "./components/pickup-request-detail";
import { NextRequest } from "next/server";
import { GET as historyBff } from "@/app/bff/order-requests/route";
const boundary = vi.hoisted(() => ({ cookie: "MOCK_ONLY_A", reads: 0 }));
vi.mock("@/modules/auth/server/auth-cookies", () => ({
  readAccessToken: async () => {
    boundary.reads++;
    return boundary.cookie;
  },
}));
const R = "11111111-1111-4111-8111-111111111111";
const receipt = {
  requestId: R,
  status: "PENDING_REVIEW",
  requestedFor: "2026-10-06T21:00:00Z",
  subtotal: 68,
  currency: "GTQ",
  orderId: null,
  orderStatus: null,
};
const details = {
  ...receipt,
  customerNote: "Nota A",
  items: [
    {
      name: "Línea A",
      quantity: 1,
      unitPrice: 68,
      lineTotal: 68,
      currencyId: R,
    },
  ],
};
let owner: string | null;
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  owner = "A";
  clientIdentityStore.invalidate();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function change(next: string | null) {
  owner = next;
  await act(async () => {
    await clientIdentityStore.refresh();
  });
}
function install(
  resource: (
    url: RequestInfo | URL,
    options?: RequestInit,
  ) => Promise<Response>,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: RequestInfo | URL, options?: RequestInit) =>
      url === "/bff/auth/session"
        ? Promise.resolve(
            owner
              ? Response.json({ user: { userId: owner } })
              : Response.json({}, { status: 401 }),
          )
        : resource(url, options),
    ),
  );
}

it.each(["fetch", "json", "error"])(
  "history ignores late A %s while B's read stays pending, even when abort is ignored",
  async (stage) => {
    const late = deferred<Response>(),
      json = deferred<unknown>(),
      b = deferred<Response>();
    const started = vi.fn(),
      jsonStarted = vi.fn();
    install(() => {
      if (owner === "B") return b.promise;
      started();
      return stage === "json"
        ? Promise.resolve({
            ok: true,
            status: 200,
            json: () => {
              jsonStarted();
              return json.promise;
            },
          } as Response)
        : late.promise;
    });
    render(<PickupHistory />);
    await waitFor(() => expect(started).toHaveBeenCalled());
    if (stage === "json")
      await waitFor(() => expect(jsonStarted).toHaveBeenCalled());
    await change("B");
    await act(async () => {
      if (stage === "error") late.reject(new Error("Error A"));
      else if (stage === "json") json.resolve([receipt]);
      else late.resolve(Response.json([receipt]));
    });
    expect(screen.queryByText(`Solicitud ${R}`)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Cargando");
    await act(async () => {
      b.resolve(Response.json([]));
    });
    expect(
      await screen.findByText("Aún no tienes solicitudes para recoger"),
    ).toBeInTheDocument();
  },
);

it.each(["fetch", "json", "error"])(
  "pending cancellation discards late %s, notice, errors and reload in B",
  async (stage) => {
    const late = deferred<Response>(),
      json = deferred<unknown>();
    let deletes = 0,
      bReads = 0;
    const jsonStarted = vi.fn();
    install((_url, options) => {
      if (options?.method === "DELETE") {
        deletes++;
        return stage === "json"
          ? Promise.resolve({
              ok: true,
              status: 200,
              json: () => {
                jsonStarted();
                return json.promise;
              },
            } as Response)
          : late.promise;
      }
      if (owner === "B") {
        bReads++;
        return Promise.resolve(
          Response.json({ ...details, customerNote: "Nota B", items: [] }),
        );
      }
      return Promise.resolve(Response.json(details));
    });
    render(<PickupRequestDetail requestId={R} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Cancelar solicitud" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Sí, cancelar solicitud" }),
    );
    await waitFor(() => expect(deletes).toBe(1));
    if (stage === "json")
      await waitFor(() => expect(jsonStarted).toHaveBeenCalled());
    await change("B");
    await screen.findByText("Nota: Nota B");
    const reads = bReads;
    await act(async () => {
      if (stage === "error") late.reject(new Error("Error A"));
      else if (stage === "json")
        json.resolve({ requestId: R, status: "CANCELLED" });
      else late.resolve(Response.json({ requestId: R, status: "CANCELLED" }));
    });
    expect(
      screen.queryByText("La solicitud fue cancelada."),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancelar solicitud" }),
    ).toBeEnabled();
    expect(bReads).toBe(reads);
  },
);

it("invalidates a pending cancellation on logout and unmount", async () => {
  const late = deferred<Response>();
  let signal: AbortSignal | null | undefined;
  install((_url, options) => {
    if (options?.method === "DELETE") {
      signal = options.signal;
      return late.promise;
    }
    return Promise.resolve(Response.json(details));
  });
  const view = render(<PickupRequestDetail requestId={R} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Cancelar solicitud" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Sí, cancelar solicitud" }),
  );
  await waitFor(() => expect(signal).toBeDefined());
  act(() => {
    owner = null;
    window.dispatchEvent(new Event("wok:logout"));
  });
  expect(screen.queryByText("Nota: Nota A")).not.toBeInTheDocument();
  expect(signal?.aborted).toBe(true);
  view.unmount();
  await act(async () => {
    late.resolve(Response.json({ requestId: R, status: "CANCELLED" }));
  });
  expect(
    screen.queryByText("La solicitud fue cancelada."),
  ).not.toBeInTheDocument();
});

it("rechecks identity before DELETE when a cookie changes without a browser event", async () => {
  let deletes = 0;
  install((_url, options) => {
    if (options?.method === "DELETE") deletes++;
    return Promise.resolve(Response.json(details));
  });
  render(<PickupRequestDetail requestId={R} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Cancelar solicitud" }),
  );
  owner = "B";
  fireEvent.click(
    screen.getByRole("button", { name: "Sí, cancelar solicitud" }),
  );
  await waitFor(() =>
    expect(clientIdentityStore.getSnapshot().ownerId).toBe("B"),
  );
  expect(deletes).toBe(0);
});

it("keeps a newer manual history read when the old read arrives out of order", async () => {
  const old = deferred<Response>();
  let reads = 0;
  install(() =>
    ++reads === 1 ? old.promise : Promise.resolve(Response.json([])),
  );
  render(<PickupHistory />);
  await waitFor(() => expect(reads).toBe(1));
  fireEvent.click(
    screen.getByRole("button", { name: "Actualizar solicitudes" }),
  );
  await screen.findByText("Aún no tienes solicitudes para recoger");
  await act(async () => {
    old.resolve(Response.json([receipt]));
  });
  expect(screen.queryByText(`Solicitud ${R}`)).not.toBeInTheDocument();
  expect(
    screen.getByText("Aún no tienes solicitudes para recoger"),
  ).toBeInTheDocument();
});

it.each([401, 403, 404])(
  "late A read error %s does not contaminate B's successful history or identity",
  async (status) => {
    const old = deferred<Response>();
    let started = false;
    install(() => {
      if (owner === "B") return Promise.resolve(Response.json([]));
      started = true;
      return old.promise;
    });
    render(<PickupHistory />);
    await waitFor(() => expect(started).toBe(true));
    await change("B");
    await screen.findByText("Aún no tienes solicitudes para recoger");
    const scope = clientIdentityStore.getSnapshot();
    await act(async () => {
      old.resolve(Response.json({ message: "Error A" }, { status }));
    });
    expect(clientIdentityStore.getSnapshot()).toEqual(scope);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByText("Aún no tienes solicitudes para recoger"),
    ).toBeInTheDocument();
  },
);

it("does not publish B-owned history through the real BFF during an unobserved A-B-A", async () => {
  const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const bReceipt = { ...receipt, idempotentReplay: false };
  let completed = 0;
  const domainCalls: string[] = [];
  boundary.reads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url === "/bff/auth/session")
        return Response.json({ user: { userId: a } });
      if (url === "/bff/order-requests") {
        boundary.cookie = "MOCK_ONLY_B";
        const response = await historyBff(
          new NextRequest("http://mock.invalid/bff/order-requests", {
            headers: init.headers,
          }),
        );
        boundary.cookie = "MOCK_ONLY_A";
        completed++;
        return response;
      }
      const token = new Headers(init.headers).get("authorization");
      const principal = token === "Bearer MOCK_ONLY_B" ? b : a;
      if (new URL(url).pathname === "/api/v1/auth/me")
        return Response.json({
          userId: principal,
          email: "client@mock.invalid",
          displayName: "MOCK_ONLY Client",
          status: "ACTIVE",
          roles: ["CLIENT"],
          permissions: [],
        });
      if (new URL(url).pathname === "/api/v1/client/order-requests") {
        domainCalls.push(principal);
        // El UUID R es exclusivo de B; A recibe una lista vacía.
        return Response.json(principal === b ? [bReceipt] : []);
      }
      throw new Error(`Unexpected MOCK_ONLY URL: ${url}`);
    }),
  );
  await act(async () => {
    await clientIdentityStore.refresh();
  });
  render(<PickupHistory userId={a} />);
  await waitFor(() => expect(completed).toBe(1));
  await waitFor(() =>
    expect(clientIdentityStore.getSnapshot().status).toBe("unverified"),
  );
  expect(screen.queryByText(`Solicitud ${R}`)).not.toBeInTheDocument();
  expect(domainCalls).toEqual([]);
  expect(boundary.reads).toBe(1);
});

it.each([
  [409, "CLIENT_PRINCIPAL_CHANGED"],
  [503, "CLIENT_PRINCIPAL_UNVERIFIED"],
] as const)(
  "blocks cancellation and keeps its captured expected owner on boundary %s",
  async (status, code) => {
    let deletes = 0;
    install(async (_url, init) => {
      expect(new Headers(init?.headers).get("X-Wok-Expected-Principal")).toBe(
        "A",
      );
      if (init?.method === "DELETE") {
        deletes++;
        return Response.json({ code }, { status });
      }
      return Response.json(details);
    });
    render(<PickupRequestDetail requestId={R} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Cancelar solicitud" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Sí, cancelar solicitud" }),
    );
    await screen.findByText("Verifica tu sesión para continuar.");
    expect(clientIdentityStore.getSnapshot().status).toBe("unverified");
    expect(screen.queryByText("Nota: Nota A")).not.toBeInTheDocument();
    expect(
      screen.queryByText("La solicitud fue cancelada."),
    ).not.toBeInTheDocument();
    expect(deletes).toBe(1);
  },
);
