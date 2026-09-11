import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { OperationalDashboard } from "./operational-dashboard-view";

afterEach(cleanup);

describe("OperationalDashboard", () => {
  it("filters active orders by status", async () => {
    const user = userEvent.setup();
    render(<OperationalDashboard />);

    await user.click(screen.getByRole("button", { name: "Retrasados" }));

    expect(screen.getByText("#D-088")).toBeInTheDocument();
    expect(screen.queryByText("#A-104")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retrasados" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("links summaries to their operational routes", () => {
    render(<OperationalDashboard />);

    expect(screen.getByRole("link", { name: /Ver mesas/ })).toHaveAttribute(
      "href",
      "/operation/tables",
    );
    expect(screen.getByRole("link", { name: /Ver cocina/ })).toHaveAttribute(
      "href",
      "/operation/kitchen",
    );
  });

  it("expands the attention list on demand", async () => {
    const user = userEvent.setup();
    render(<OperationalDashboard />);

    expect(screen.getByText("Salmón en nivel crítico")).toBeInTheDocument();
    expect(
      screen.queryByText("Pedido #D-088 retrasado"),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Desplegar alertas de atención" }),
    );

    expect(screen.getByText("Pedido #D-088 retrasado")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Contraer alertas de atención" }),
    ).toHaveAttribute("aria-expanded", "true");
  });
});
