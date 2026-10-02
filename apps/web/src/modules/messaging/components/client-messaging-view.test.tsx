import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ClientSessionProvider } from "@/modules/clients/client-session-provider";
import {
  createClientSessionStore,
  emptyClientSession,
  type ClientOrder,
} from "@/modules/clients/client-session";
import {
  clientMessagingStateFixtures,
  deliveryQuickReplies,
} from "@/data/fixtures/client-messaging";
import { ClientMessagingView } from "./client-messaging-view";

afterEach(cleanup);
function deliveryStore(
  stage: ClientOrder["deliveryStage"] = "in-transit",
  status: ClientOrder["status"] = "ready",
  fulfillment: ClientOrder["fulfillment"] = "delivery",
) {
  const order: ClientOrder = {
    id: "delivery-test",
    createdAt: "2026-09-22T12:00:00Z",
    summary: "Pedido local",
    fulfillment,
    status,
    restaurantStage: "ready",
    deliveryStage: stage,
    changes: [],
    lines: [],
    subtotalCents: 0,
  };
  return createClientSessionStore({ ...emptyClientSession, orders: [order] });
}
describe("Client messaging", () => {
  it("offers delivery and general help without inventing an active delivery", () => {
    render(
      <ClientSessionProvider store={createClientSessionStore()}>
        <ClientMessagingView />
      </ClientSessionProvider>,
    );
    expect(
      screen.getByRole("heading", { name: "Delivery de mi pedido" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/No hay una entrega activa/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ayuda general" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Ver seguimiento" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Estado de conexión")).not.toBeInTheDocument();
  });
  it("fills all five quick replies, allows editing, and retains local messages through navigation", async () => {
    const user = userEvent.setup();
    const store = deliveryStore();
    const mount = () =>
      render(
        <ClientSessionProvider store={store}>
          <ClientMessagingView />
        </ClientSessionProvider>,
      );
    const view = mount();
    const composer = screen.getByRole("textbox", {
      name: "Escribe un mensaje",
    });
    for (const reply of deliveryQuickReplies) {
      await user.click(screen.getByRole("button", { name: reply }));
      expect(composer).toHaveValue(reply);
      expect(composer).toHaveFocus();
    }
    await user.clear(composer);
    await user.type(composer, "Estoy en la entrada lateral.");
    await user.click(
      screen.getByRole("button", { name: "Guardar mensaje localmente" }),
    );
    expect(
      within(screen.getByRole("log")).getByText("Estoy en la entrada lateral."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Guardado localmente; todavía no enviado/),
    ).toBeInTheDocument();
    expect(document.querySelector("time")).toHaveAttribute("datetime");
    expect(
      screen.getByRole("button", { name: "Guardar mensaje localmente" }),
    ).toBeDisabled();
    view.unmount();
    mount();
    expect(
      within(screen.getByRole("log")).getByText("Estoy en la entrada lateral."),
    ).toBeInTheDocument();
  });
  it("shows the delivery order and links its tracking without mixing in pickup orders", async () => {
    const store = deliveryStore();
    const order = store.getSnapshot().orders[0];
    render(
      <ClientSessionProvider store={store}>
        <ClientMessagingView />
      </ClientSessionProvider>,
    );
    expect(
      screen.getByRole("link", { name: "Ver seguimiento" }),
    ).toHaveAttribute("href", `/client/orders/${order.id}`);
    expect(screen.getByText(`Pedido #${order.id} · Listo`)).toBeInTheDocument();
    expect(
      screen.queryByText(/No hay una entrega activa/),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Estoy en la entrada." }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Guardar mensaje localmente" }),
    );
    expect(
      store.getSnapshot().messages[`delivery-order:${order.id}`][0].orderId,
    ).toBe(order.id);
  });
  it.each(clientMessagingStateFixtures)(
    "retains the $state contract without technical controls",
    (conversation) => {
      render(
        <ClientSessionProvider store={createClientSessionStore()}>
          <ClientMessagingView conversations={[conversation]} />
        </ClientSessionProvider>,
      );
      expect(screen.getByRole("status")).toBeInTheDocument();
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "Ayuda" },
      });
      if (conversation.state !== "human-attention-required")
        expect(
          screen.getByRole("button", { name: "Guardar mensaje localmente" }),
        ).toBeDisabled();
    },
  );
  it("only selects the receipt name locally and clears it when changing conversations", async () => {
    const user = userEvent.setup();
    render(
      <ClientSessionProvider store={deliveryStore()}>
        <ClientMessagingView />
      </ClientSessionProvider>,
    );
    await user.upload(
      screen.getByLabelText("Seleccionar comprobante"),
      new File(["test"], "receipt.pdf", { type: "application/pdf" }),
    );
    expect(
      screen.getByText(
        /receipt.pdf. Archivo seleccionado localmente; no enviado/,
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ayuda general" }));
    expect(screen.queryByText(/receipt.pdf/)).not.toBeInTheDocument();
  });
});

describe("Delivery chat access", () => {
  it.each([
    ["pending", "pending", "delivery", false],
    ["pending", "ready", "delivery", false],
    ["in-transit", "ready", "delivery", true],
    ["delivered", "ready", "delivery", false],
    ["in-transit", "delivered", "delivery", false],
    ["in-transit", "ready", "pickup", false],
  ] as const)("guards %s / %s / %s", (stage, status, fulfillment, allowed) => {
    const store = deliveryStore(stage, status, fulfillment);
    render(
      <ClientSessionProvider store={store}>
        <ClientMessagingView />
      </ClientSessionProvider>,
    );
    const input = screen.getByRole("textbox", { name: "Escribe un mensaje" });
    expect(input).toHaveProperty("disabled", !allowed);
    for (const reply of deliveryQuickReplies) {
      expect(screen.getByRole("button", { name: reply })).toHaveProperty(
        "disabled",
        !allowed,
      );
    }
    if (!allowed) {
      fireEvent.change(input, { target: { value: "No debe guardarse" } });
      fireEvent.submit(input.closest("form")!);
      expect(store.getSnapshot().messages).toEqual({});
    }
    if (fulfillment === "pickup")
      expect(
        screen.getByRole("link", { name: "Ver mis pedidos" }),
      ).toHaveAttribute("href", "/client/orders");
    else if (stage === "delivered" || status === "delivered")
      expect(screen.getByText(/Entrega finalizada/)).toBeInTheDocument();
    else if (!allowed)
      expect(screen.getByText(/El chat estará disponible/)).toBeInTheDocument();
  });
});
