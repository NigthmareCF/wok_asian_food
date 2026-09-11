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
