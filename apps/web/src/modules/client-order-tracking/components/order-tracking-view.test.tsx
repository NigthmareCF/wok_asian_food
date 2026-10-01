import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { clientOrderTrackingFixtures } from "@/data/fixtures/client-order-tracking";
import { orderStatusLabels } from "../order-tracking";
import { OrderTrackingView } from "./order-tracking-view";

afterEach(cleanup);

describe("OrderTrackingView", () => {
  it.each(clientOrderTrackingFixtures)(
    "documents the $status state",
    (order) => {
      render(<OrderTrackingView order={order} />);
      expect(
        screen.getByText(orderStatusLabels[order.status], { selector: "span" }),
      ).toBeInTheDocument();
    },
  );

  it("renders the six demo state buttons with their routes and marks the current state", () => {
    const order = clientOrderTrackingFixtures.find(
      ({ id }) => id === "demo-preparing",
    );
    render(<OrderTrackingView order={order} />);

    const expectedLinks = [
      ["Pendiente", "/client/orders/demo-pending"],
      ["Confirmado", "/client/orders/demo-confirmed"],
      ["Preparando", "/client/orders/demo-preparing"],
      ["Listo", "/client/orders/demo-ready"],
      ["Retrasado", "/client/orders/demo-190"],
      ["Entregado", "/client/orders/demo-delivered"],
    ];

    expect(
      screen.getByRole("heading", { name: "Probar estados del pedido" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Controles de demostración. No actualizan un pedido real.",
      ),
    ).toBeInTheDocument();
    expectedLinks.forEach(([label, href]) => {
      expect(screen.getByRole("link", { name: label })).toHaveAttribute(
        "href",
        href,
      );
    });
    expect(screen.getByRole("link", { name: "Preparando" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Pendiente" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("shows delay data and separates external delivery from restaurant preparation", () => {
    const order = clientOrderTrackingFixtures.find(
      ({ id }) => id === "demo-190",
    );
    render(<OrderTrackingView order={order} />);

    expect(screen.getByText(/tardando un poco más/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "ENTREGA O TRASLADO EXTERNO" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Traslado externo pendiente")).toBeInTheDocument();
    expect(
      screen.getByText("Preparación y traslado externo"),
    ).toBeInTheDocument();
  });

  it("renders a neutral not-found state for an unknown order id", () => {
    render(<OrderTrackingView />);
    expect(
      screen.getByRole("heading", { name: "Pedido no encontrado" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no está disponible en la demostración/),
    ).toBeInTheDocument();
  });
});
