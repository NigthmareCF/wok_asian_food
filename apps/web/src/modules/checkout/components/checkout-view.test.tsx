import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCheckoutPreviewSnapshot } from "@/data/fixtures/checkout-preview";
import { CartProvider, useCart } from "@/modules/cart";
import { menuFixtures } from "@/data/fixtures/menu";
import { CheckoutView } from "./checkout-view";
import { ClientCheckout } from "./client-checkout";

import { ClientSessionProvider } from "@/modules/clients/client-session-provider";
import { createClientSessionStore } from "@/modules/clients/client-session";
import { ClientOrderListView } from "@/modules/client-order-tracking/components/client-order-list-view";
import { ClientOrderTracking } from "@/modules/client-order-tracking/components/client-order-tracking";
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.sessionStorage.clear();
});
describe("CheckoutView", () => {
  it.each(["table", "pickup", "delivery"] as const)(
    "keeps %s free of technical service controls and unauthorized payment methods",
    (service) => {
      render(
        <CheckoutView
          snapshot={createCheckoutPreviewSnapshot(service)}
          actions={{ onRevalidate: vi.fn(), onConfirm: vi.fn() }}
        />,
      );
      expect(
        screen.queryByText("Probar tipos de servicio"),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("MÉTODO DE PAGO")).not.toBeInTheDocument();
      expect(screen.queryByText(/gratis|Q0.00/)).not.toBeInTheDocument();
      if (service === "table") {
        expect(screen.queryByText(/Q[0-9]/)).not.toBeInTheDocument();
        expect(
          screen.queryByText(/Subtotal|propina|Opciones de pago/i),
        ).not.toBeInTheDocument();
      } else expect(screen.getByText("Q385.00")).toBeInTheDocument();
      expect(
        screen.getByRole("button", {
          name:
            service === "table" ? "ENVIAR SOLICITUD" : "CONFIRMAR SOLICITUD",
        }),
      ).toBeDisabled();
    },
  );
});

function CartSetup() {
  const cart = useCart();
  return (
    <>
      <button
        onClick={() =>
          cart.addItem({
            productId: "panko",
            quantity: 2,
            selectedOptions: { "tuna-only": "tuna-only" },
          })
        }
      >
        Add configured product
      </button>
      <button
        onClick={() => {
          cart.addItem({
            productId: menuFixtures.find(
              (p) => p.availability !== "unavailable" && !p.options?.length,
            )!.id,
            quantity: 2,
            selectedOptions: {},
          });
        }}
      >
        Add product
      </button>
      <button onClick={() => cart.setService("pickup")}>Pickup</button>
      <button onClick={() => cart.setService("table")}>Table</button>
      <button onClick={() => cart.setService("delivery")}>Delivery</button>
      <output aria-label="Cart count">{cart.items.length}</output>
      <output aria-label="Cart service">{cart.service}</output>
      <button onClick={cart.clearCart}>Clear cart</button>
      <button
        onClick={() => {
          cart.beginPendingRequest();
        }}
      >
        Begin wait
      </button>
      <button onClick={cart.waitForPendingRequest}>Retry wait</button>
      <output aria-label="Pending request">
        {cart.pendingRequest ? "pending" : "none"}
      </output>
    </>
  );
}
describe("ClientCheckout with C-05", () => {
  it("uses the configured product quantities, choices and subtotal from C-05", async () => {
    const user = userEvent.setup();
    render(
      <ClientSessionProvider store={createClientSessionStore()}>
        <CartProvider>
          <CartSetup />
          <ClientCheckout />
        </CartProvider>
      </ClientSessionProvider>,
    );
    await user.click(screen.getByText("Add configured product"));
    await user.click(screen.getByText("Pickup"));
    expect(screen.getByText("2 × Panko · Solo atún")).toBeInTheDocument();
    expect(screen.getAllByText("Q150.00")).toHaveLength(2);
  });
  it.each(["unavailable", "invalid-options"])(
    "blocks %s after adding a product",
    async (conflict) => {
      const user = userEvent.setup();
      const products = menuFixtures.map((product) =>
        product.id !== "panko"
          ? product
          : conflict === "unavailable"
            ? { ...product, availability: "unavailable" as const }
            : { ...product, options: [] },
      );
      render(
        <ClientSessionProvider store={createClientSessionStore()}>
          <CartProvider>
            <CartSetup />
            <ClientCheckout products={products} />
          </CartProvider>
        </ClientSessionProvider>,
      );
      await user.click(screen.getByText("Add configured product"));
      await user.click(screen.getByText("Pickup"));
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "CONFIRMAR SOLICITUD" }),
      ).not.toBeInTheDocument();
    },
  );
  it("handles empty and missing service, revalidates and invalidates review when service changes", async () => {
    const user = userEvent.setup();
    render(
      <ClientSessionProvider store={createClientSessionStore()}>
        <CartProvider>
          <CartSetup />
          <ClientCheckout />
        </CartProvider>
      </ClientSessionProvider>,
    );
    expect(
      screen.getByRole("heading", { name: "Tu pedido está vacío" }),
    ).toBeInTheDocument();
    await user.click(screen.getByText("Add product"));
    expect(
      screen.getByRole("heading", { name: "Selecciona un servicio" }),
    ).toBeInTheDocument();
    await user.click(screen.getByText("Pickup"));
    expect(
      screen.getByText("Tipo de servicio: Para recoger"),
    ).toBeInTheDocument();
    await user.click(screen.getByText("REVALIDAR SOLICITUD"));
    expect(screen.getByText(/Datos locales revisados/)).toHaveAttribute(
      "role",
      "status",
    );
    await user.click(screen.getByText("Table"));
    expect(
      screen.queryByText("Datos locales revisados", { exact: false }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ENVIAR SOLICITUD" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Cart count")).toHaveTextContent("1");
  });
  it("blocks a product that disappeared since adding it", async () => {
    const user = userEvent.setup();
    render(
      <ClientSessionProvider store={createClientSessionStore()}>
        <CartProvider>
          <CartSetup />
          <ClientCheckout products={[]} />
        </CartProvider>
      </ClientSessionProvider>,
    );
    await user.click(screen.getByText("Add product"));
    await user.click(screen.getByText("Pickup"));
    expect(screen.getByRole("alert")).toHaveTextContent("no disponibles");
    expect(
      screen.queryByRole("button", { name: "CONFIRMAR SOLICITUD" }),
    ).not.toBeInTheDocument();
  });
});

describe("Local checkout completion", () => {
  it("clears all items and pending work idempotently, preserving service", async () => {
    const user = userEvent.setup();
    render(
      <CartProvider>
        <CartSetup />
      </CartProvider>,
    );
    await user.click(screen.getByText("Add configured product"));
    await user.click(screen.getByText("Add product"));
    await user.click(screen.getByText("Pickup"));
    await user.click(screen.getByText("Begin wait"));
    await user.click(screen.getByText("Retry wait"));
    expect(screen.getByLabelText("Pending request")).toHaveTextContent(
      "pending",
    );
    await user.click(screen.getByText("Clear cart"));
    await user.click(screen.getByText("Clear cart"));
    expect(screen.getByLabelText("Cart count")).toHaveTextContent("0");
    expect(screen.getByLabelText("Cart service")).toHaveTextContent("pickup");
    expect(screen.getByLabelText("Pending request")).toHaveTextContent("none");
  });
  it.each(["Pickup", "Table", "Delivery"])(
    "creates one %s order, clears cart and opens tracking",
    async (service) => {
      const user = userEvent.setup();
      const store = createClientSessionStore();
      const view = render(
        <ClientSessionProvider store={store}>
          <CartProvider>
            <CartSetup />
            <ClientCheckout />
          </CartProvider>
        </ClientSessionProvider>,
      );
      await user.click(screen.getByText("Add configured product"));
      await user.click(screen.getByText(service));
      const confirm = screen.getByRole("button", {
        name: service === "Table" ? "ENVIAR SOLICITUD" : "CONFIRMAR SOLICITUD",
      });
      expect(confirm).toBeDisabled();
      await user.click(screen.getByText("REVALIDAR SOLICITUD"));
      expect(confirm).toBeEnabled();
      await user.dblClick(confirm);
      const orders = store.getSnapshot().orders;
      expect(orders).toHaveLength(1);
      const order = orders[0];
      expect(order.status).toBe("pending");
      expect(order.lines[0]).toMatchObject({
        productId: "panko",
        quantity: 2,
        selectedOptions: { "tuna-only": "tuna-only" },
      });
      expect(order.subtotalCents).toBe(service === "Table" ? undefined : 15000);
      expect(order.lines[0].unitPriceCents).toBe(
        service === "Table" ? undefined : 7500,
      );
      expect(screen.getByLabelText("Cart count")).toHaveTextContent("0");
      expect(push).toHaveBeenCalledExactlyOnceWith(
        "/client/orders/" + order.id,
      );
      view.rerender(
        <ClientSessionProvider store={store}>
          <ClientOrderListView />
        </ClientSessionProvider>,
      );
      expect(
        screen.getByRole("link", { name: /Ver seguimiento/ }),
      ).toHaveAttribute("href", "/client/orders/" + order.id);
      view.rerender(
        <ClientSessionProvider store={store}>
          <ClientOrderTracking orderId={order.id} />
        </ClientSessionProvider>,
      );
      expect(
        screen.getByRole("heading", { name: "Seguimiento de pedido" }),
      ).toBeInTheDocument();
      expect(screen.getByText("2 × Panko · Solo atún")).toBeInTheDocument();
    },
  );
  it.each(["null", "throw"])(
    "preserves cart on %s failure and allows retry",
    async (failure) => {
      const user = userEvent.setup();
      const store = createClientSessionStore();
      const create = vi.spyOn(store, "createOrder");
      if (failure === "null") create.mockReturnValueOnce(null);
      else
        create.mockImplementationOnce(() => {
          throw new Error("local failure");
        });
      render(
        <ClientSessionProvider store={store}>
          <CartProvider>
            <CartSetup />
            <ClientCheckout />
          </CartProvider>
        </ClientSessionProvider>,
      );
      await user.click(screen.getByText("Add configured product"));
      await user.click(screen.getByText("Pickup"));
      await user.click(screen.getByText("REVALIDAR SOLICITUD"));
      await user.click(screen.getByText("CONFIRMAR SOLICITUD"));
      expect(screen.getByText(/No se pudo guardar/)).toBeInTheDocument();
      expect(screen.getByLabelText("Cart count")).toHaveTextContent("1");
      expect(store.getSnapshot().orders).toHaveLength(0);
      expect(push).not.toHaveBeenCalled();
      await user.click(screen.getByText("CONFIRMAR SOLICITUD"));
      expect(store.getSnapshot().orders).toHaveLength(1);
    },
  );
});
