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

  it("does not expose technical controls or alternate state links", () => {
    render(<OrderTrackingView order={clientOrderTrackingFixtures[0]} />);
    expect(
      screen.queryByText("Probar estados del pedido"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(
      screen
        .getAllByRole("link")
        .some((link) => link.getAttribute("href")?.includes("demo-")),
    ).toBe(false);
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
      screen.getByText(/no está disponible en esta sesión/),
    ).toBeInTheDocument();
  });
});
