import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { AdminDashboardView } from "./admin-dashboard-view";

afterEach(cleanup);

describe("AdminDashboardView", () => {
  it("starts with every administrative section expanded", () => {
    render(<AdminDashboardView />);

    expect(screen.getByRole("button", { name: /Alertas/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(
      screen.getByRole("button", { name: /Productos críticos/ }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: /Compras sugeridas/ }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: /Producciones sugeridas/ }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Revisión del servicio")).toBeVisible();
  });

  it("opens and closes each section independently", async () => {
    const user = userEvent.setup();
    render(<AdminDashboardView />);

    const alertsToggle = screen.getByRole("button", { name: /Alertas/ });
    const criticalProductsToggle = screen.getByRole("button", {
      name: /Productos críticos/,
    });

    await user.click(alertsToggle);

    expect(alertsToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Revisión del servicio")).not.toBeVisible();
    expect(criticalProductsToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Salmón")).toBeVisible();

    await user.click(alertsToggle);

    expect(alertsToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Revisión del servicio")).toBeVisible();
    expect(criticalProductsToggle).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps other sections unchanged when one section closes", async () => {
    const user = userEvent.setup();
    render(<AdminDashboardView />);

    await user.click(screen.getByRole("button", { name: /Compras sugeridas/ }));

    expect(
      screen.getByRole("button", { name: /Compras sugeridas/ }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Insumos de cocina")).not.toBeVisible();
    expect(
      screen.getByRole("button", { name: /Producciones sugeridas/ }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Preparación base")).toBeVisible();
  });

  it("changes the selected period and updates the administrative metrics", async () => {
    const user = userEvent.setup();
    render(<AdminDashboardView />);

    expect(screen.getByRole("button", { name: "Hoy" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Semana" }));

    expect(screen.getByRole("button", { name: "Semana" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("Revisión semanal")).toBeInTheDocument();
  });

  it("shows the empty state without adding unconfirmed fields", async () => {
    const user = userEvent.setup();
    render(<AdminDashboardView />);

    await user.click(screen.getByRole("button", { name: "Vacío" }));

    expect(
      screen.getByText("Sin alertas en este período."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Sin compras sugeridas en este período."),
    ).toBeInTheDocument();
  });

  it("shows loading and error states for simulated data", async () => {
    const user = userEvent.setup();
    render(<AdminDashboardView />);

    await user.click(screen.getByRole("button", { name: "Carga" }));

    expect(screen.getByText("Cargando dashboard")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Error" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "No pudimos cargar el dashboard",
    );
  });
});
