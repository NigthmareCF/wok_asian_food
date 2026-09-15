import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { clientOrderTrackingFixtures } from "@/data/fixtures/client-order-tracking";
import { ClientOrderListView } from "./client-order-list-view";

afterEach(cleanup);

describe("ClientOrderListView", () => {
  it("lists client demo orders and links each one to its tracking route", () => {
    render(<ClientOrderListView />);

    clientOrderTrackingFixtures.forEach((order) => {
      expect(
        screen.getByRole("link", {
          name: new RegExp(order.id.replace("demo-", "")),
        }),
      ).toHaveAttribute("href", `/client/orders/${order.id}`);
      expect(screen.getByText(order.summary)).toBeInTheDocument();
    });
    expect(screen.queryByText(/cocina|caja|cancelar/i)).not.toBeInTheDocument();
  });

  it("renders a client-safe empty state", () => {
    render(<ClientOrderListView orders={[]} />);

    expect(
      screen.getByRole("heading", { name: "No hay pedidos demostrativos" }),
    ).toBeInTheDocument();
  });
});
