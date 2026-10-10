import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ClientSessionProvider } from "@/modules/clients/client-session-provider";
import { createClientSessionStore } from "@/modules/clients/client-session";
import { ClientOrderListView } from "./client-order-list-view";
import { ClientOrderTracking } from "./client-order-tracking";

afterEach(cleanup);
describe("Client orders", () => {
  it("starts empty with access to the menu", () => {
    render(
      <ClientSessionProvider store={createClientSessionStore()}>
        <ClientOrderListView />
      </ClientSessionProvider>,
    );
    expect(
      screen.getByText("Todavía no hay pedidos en esta sesión"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver menú" })).toHaveAttribute(
      "href",
      "/client/menu",
    );
  });
  it("lists and tracks the same local order without exposing state controls", () => {
    const store = createClientSessionStore();
    const order = store.createOrder({
      fulfillment: "delivery",
      subtotalCents: 7500,
      lines: [
        {
          id: "panko",
          productId: "panko",
          title: "Panko",
          quantity: 1,
          selectedOptions: {},
          unitPriceCents: 7500,
        },
      ],
    })!;
    const view = render(
      <ClientSessionProvider store={store}>
        <ClientOrderListView />
      </ClientSessionProvider>,
    );
    expect(
      screen.getByRole("link", { name: /Pedido #local-order/ }),
    ).toHaveAttribute("href", `/client/orders/${order.id}`);
    expect(screen.getByText("Delivery")).toBeInTheDocument();
    expect(document.querySelector("time")).toHaveAttribute(
      "datetime",
      order.createdAt,
    );
    view.rerender(
      <ClientSessionProvider store={store}>
        <ClientOrderTracking orderId={order.id} />
      </ClientSessionProvider>,
    );
    expect(
      screen.getByRole("heading", { name: "Seguimiento de pedido" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Probar estados del pedido"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Tiempo estimado pendiente de confirmación."),
    ).toBeInTheDocument();
    view.rerender(
      <ClientSessionProvider store={store}>
        <ClientOrderTracking orderId="missing" />
      </ClientSessionProvider>,
    );
    expect(screen.getByText("Pedido no encontrado")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mis pedidos" })).toHaveAttribute(
      "href",
      "/client/orders",
    );
  });
});
