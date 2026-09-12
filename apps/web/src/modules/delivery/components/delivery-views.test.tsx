import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { DeliverySessionProvider } from "../delivery-session-provider";
import { DeliveryListView } from "./delivery-list-view";
import { DeliveryDetailView } from "./delivery-detail-view";

afterEach(cleanup);

const renderDelivery = (view: React.ReactNode = <DeliveryListView />) =>
  render(<DeliverySessionProvider>{view}</DeliverySessionProvider>);

describe("Delivery views", () => {
  it("assigns an available driver to a waiting order", async () => {
    const user = userEvent.setup();
    renderDelivery(<DeliveryDetailView orderId="D-090" />);

    await user.click(screen.getByRole("button", { name: /Asignar repartidor/ }));

    const dialog = screen.getByRole("dialog", {
      name: "Repartidores disponibles",
    });
    await user.click(
      within(dialog).getByRole("button", { name: /Carlos Mendoza/ }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Repartidor asignado. Estado actualizado",
    );
    expect(screen.getAllByText("Repartidor asignado").length).toBeGreaterThan(0);
  });

  it("marks a picked-up order as delivered", async () => {
    const user = userEvent.setup();
    renderDelivery(<DeliveryDetailView orderId="D-091" />);

    await user.click(
      screen.getByRole("button", { name: /Marcar como entregado/ }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(/Estado actualizado/);
    expect(screen.getAllByText("Entregado").length).toBeGreaterThan(0);
  });

  it("filters the list by state and customer", async () => {
    const user = userEvent.setup();
    renderDelivery();

    expect(screen.getByText("#D-090")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Entregados/ }));
    expect(screen.getByText("No encontramos pedidos")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Activos/ }));
    expect(screen.getByText("#D-090")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/Pedido, cliente/), "Sofía");
    expect(screen.getByText("#D-091")).toBeInTheDocument();
    expect(screen.queryByText("#D-090")).not.toBeInTheDocument();
  });
});