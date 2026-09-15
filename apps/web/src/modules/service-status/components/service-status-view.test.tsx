import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ServiceStatusProvider } from "../service-status-provider";
import { ServiceStatusView } from "./service-status-view";

afterEach(cleanup);

const renderStatus = () =>
  render(
    <ServiceStatusProvider>
      <ServiceStatusView />
    </ServiceStatusProvider>,
  );

describe("ServiceStatusView", () => {
  it("applies a new status only when a reason is provided", async () => {
    const user = userEvent.setup();
    renderStatus();

    await user.click(screen.getByRole("button", { name: /Solo recoger/ }));
    const confirmButton = screen.getByRole("button", {
      name: /Confirmar cambio de estado/,
    });
    expect(confirmButton).toBeDisabled();

    await user.type(
      screen.getByPlaceholderText(/Ej\. Personal reducido/),
      "Personal reducido",
    );
    await user.click(confirmButton);

    expect(screen.getByRole("status")).toHaveTextContent(
      'Estado del servicio cambiado a "Solo recoger". Personal reducido',
    );
    expect(screen.getAllByText("Solo recoger").length).toBeGreaterThan(1);
  });

  it("shows the current status and its history", () => {
    renderStatus();
    expect(screen.getAllByText("Normal").length).toBeGreaterThan(0);
    expect(screen.getByText("Hora pico de almuerzo")).toBeInTheDocument();
  });
});