import { clientIdentityStore } from "@/modules/clients/client-identity-store";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveCartProvider } from "../live-cart-provider";
import { createLiveCartStore, liveCartOwnerKey } from "../live-cart-storage";
import { LiveMenuCatalog } from "@/modules/menu/components/live-menu-catalog";
import { LiveCartView } from "./live-cart-view";
import { LiveCartLink } from "./cart-link";

const product = {
  id: "real-api-id",
  name: "Gyozas",
  price: 68,
  currency: "GTQ",
  estimatedPreparationSeconds: 300,
};
const menu = {
  asOf: "2026-10-02T12:00:00Z",
  categories: [{ id: "real-category", name: "Platos", items: [product] }],
};
afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("catalog cart integration", () => {
  it("adds from the API catalog, updates the counter, survives remount, changes quantity and removes", async () => {
    installFetch(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(Response.json(menu))),
    );
    const user = userEvent.setup();
    const view = render(
      <LiveCartProvider>
        <LiveCartLink />
        <LiveMenuCatalog />
      </LiveCartProvider>,
    );
    await user.click(
      await screen.findByRole("button", { name: "Agregar Gyozas al carrito" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Agregar Gyozas al carrito" }),
    );
    expect(
      screen.getByRole("link", { name: "Tu pedido, 2 artículos" }),
    ).toBeInTheDocument();
    view.unmount();
    render(
      <LiveCartProvider>
        <LiveCartView />
      </LiveCartProvider>,
    );
    expect(await screen.findByLabelText("Subtotal GTQ")).toHaveTextContent(
      "136.00",
    );
    await user.click(screen.getByRole("button", { name: "Aumentar Gyozas" }));
    expect(screen.getByLabelText("Subtotal GTQ")).toHaveTextContent("204.00");
    await user.click(screen.getByRole("button", { name: "Disminuir Gyozas" }));
    expect(screen.getByLabelText("Cantidad de Gyozas")).toHaveTextContent("2");
    expect(
      screen.getByRole("link", { name: "Solicitar para recoger" }),
    ).toHaveAttribute("href", "/client/checkout");
    await user.click(screen.getByRole("button", { name: "Eliminar Gyozas" }));
    expect(screen.getByText("Tu pedido está vacío")).toBeInTheDocument();
    expect(createLiveCartStore().getSnapshot()).toEqual([]);
  });

  it("uses fresh API prices instead of browser values and keeps removed catalog items visible", async () => {
    window.sessionStorage.setItem(
      liveCartOwnerKey(clientIdentityStore.getSnapshot()),
      JSON.stringify([
        { productId: product.id, name: product.name, quantity: 2, price: 0.01 },
      ]),
    );
    installFetch(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            ...menu,
            categories: [
              { ...menu.categories[0], items: [{ ...product, price: 70 }] },
            ],
          }),
        )
        .mockResolvedValueOnce(Response.json({ ...menu, categories: [] })),
    );
    const user = userEvent.setup();
    render(
      <LiveCartProvider>
        <LiveCartView />
      </LiveCartProvider>,
    );
    expect(await screen.findByLabelText("Subtotal GTQ")).toHaveTextContent(
      "140.00",
    );
    await user.click(
      screen.getByRole("button", { name: "Actualizar precios" }),
    );
    expect(
      await screen.findByText(/Este producto ya no está/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Subtotal GTQ")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Aumentar Gyozas" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Eliminar Gyozas" }),
    ).toBeEnabled();
  });

  it("keeps the draft during API failure and recovers on retry", async () => {
    createLiveCartStore().add(product);
    installFetch(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValueOnce(Response.json(menu)),
    );
    const user = userEvent.setup();
    render(
      <LiveCartProvider>
        <LiveCartView />
      </LiveCartProvider>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tus artículos siguen guardados",
    );
    expect(createLiveCartStore().getSnapshot()).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByLabelText("Subtotal GTQ")).toHaveTextContent(
      "68.00",
    );
    window.dispatchEvent(new Event("wok:logout"));
    await waitFor(() =>
      expect(
        screen.getByText("Verifica tu sesión para consultar el carrito."),
      ).toBeInTheDocument(),
    );
  });
});

describe("live draft validation", () => {
  it("rejects malformed or duplicate browser entries and never imports fixture carts", () => {
    window.sessionStorage.setItem(
      "wok.cart.v1",
      JSON.stringify({ items: [{ productId: "fixture", quantity: 2 }] }),
    );
    expect(createLiveCartStore().getSnapshot()).toEqual([]);
    for (const entries of [
      [{ productId: product.id, name: product.name, quantity: -1 }],
      [
        { productId: product.id, name: product.name, quantity: 1 },
        { productId: product.id, name: product.name, quantity: 1 },
      ],
    ]) {
      window.sessionStorage.setItem(
        liveCartOwnerKey(clientIdentityStore.getSnapshot()),
        JSON.stringify(entries),
      );
      expect(createLiveCartStore().getSnapshot()).toEqual([]);
    }
  });

  it("enforces quantity limits without losing the draft", () => {
    const store = createLiveCartStore();
    store.add(product);
    store.setQuantity(product.id, 100);
    expect(store.add(product)).toBe(false);
    store.setQuantity(product.id, 101);
    store.setQuantity(product.id, 0);
    store.setQuantity(product.id, 1.5);
    expect(store.getSnapshot()[0].quantity).toBe(100);
  });
});

let sessionOwner: string | null = "client-test";
function installFetch(_name: string, fetcher: typeof fetch) {
  vi.stubGlobal("fetch", (url: RequestInfo | URL, options?: RequestInit) =>
    url === "/bff/auth/session"
      ? Promise.resolve(
          sessionOwner
            ? Response.json({ user: { userId: sessionOwner } })
            : Response.json({}, { status: 401 }),
        )
      : fetcher(url, options),
  );
}
beforeEach(async () => {
  sessionOwner = "client-test";
  installFetch("fetch", vi.fn());
  await clientIdentityStore.refresh();
});

it("keeps the public menu and visitor cart separate when logging in", async () => {
  sessionOwner = null;
  installFetch(
    "fetch",
    vi.fn(async () => Response.json(menu)),
  );
  await clientIdentityStore.refresh();
  const user = userEvent.setup();
  const view = render(
    <LiveCartProvider>
      <LiveCartLink />
      <LiveMenuCatalog />
    </LiveCartProvider>,
  );
  await user.click(
    await screen.findByRole("button", { name: "Agregar Gyozas al carrito" }),
  );
  expect(
    screen.getByRole("link", { name: "Tu pedido, 1 artículos" }),
  ).toBeInTheDocument();
  sessionOwner = "client-test";
  await act(async () => {
    await clientIdentityStore.refresh();
  });
  expect(
    screen.getByRole("link", { name: "Tu pedido, 0 artículos" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Gyozas" })).toBeInTheDocument();
  sessionOwner = null;
  await act(async () => {
    await clientIdentityStore.refresh();
  });
  expect(
    screen.getByRole("link", { name: "Tu pedido, 1 artículos" }),
  ).toBeInTheDocument();
  view.unmount();
});

it("keeps the public menu usable while private identity cannot be verified", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL) => {
      if (url === "/bff/auth/session") throw new Error("Session unavailable");
      return Response.json(menu);
    }),
  );
  await clientIdentityStore.refresh();
  render(
    <LiveCartProvider>
      <LiveMenuCatalog />
      <LiveCartLink />
    </LiveCartProvider>,
  );
  expect(
    await screen.findByRole("heading", { name: "Gyozas" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Tu pedido, 0 artículos" }),
  ).toBeInTheDocument();
  expect(createLiveCartStore().add(product)).toBe(false);
});
