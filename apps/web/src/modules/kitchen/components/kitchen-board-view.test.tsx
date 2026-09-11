import { useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { OrderDetailView } from "@/modules/orders/components/order-detail-view";
import { OrderSessionProvider } from "@/modules/orders/order-session-provider";
import { KitchenBoardView } from "./kitchen-board-view";

afterEach(cleanup);

const renderKitchen = (view: React.ReactNode = <KitchenBoardView />) =>
  render(<OrderSessionProvider>{view}</OrderSessionProvider>);

describe("KitchenBoardView", () => {
  it("accepts a new command and moves it to preparation", async () => {
    const user = userEvent.setup();
    renderKitchen();

    const newColumn = screen.getByRole("region", { name: "Nuevos" });
    expect(within(newColumn).getByText("#A-107")).toBeInTheDocument();
    await user.click(
      within(newColumn).getByRole("button", { name: "Aceptar" }),
    );

    expect(
      within(screen.getByRole("region", { name: "Preparando" })).getByText(
        "#A-107",
      ),
    ).toBeInTheDocument();
  });

  it("filters tickets by station and updates their ETA", async () => {
    const user = userEvent.setup();
    renderKitchen();

    await user.click(screen.getByRole("button", { name: "Sushi" }));
    expect(screen.getByText("#D-088")).toBeInTheDocument();
    expect(screen.queryByText("#A-107")).not.toBeInTheDocument();

    await user.selectOptions(
      screen.getByLabelText("ETA de pedido D-088"),
      "20 min",
    );
    expect(screen.getByLabelText("ETA de pedido D-088")).toHaveValue("20 min");
  });

  it("shows only the incremental update sent from an existing order", async () => {
    const user = userEvent.setup();

    function IntegratedHarness() {
      const [showKitchen, setShowKitchen] = useState(false);
      return (
        <>
          <button onClick={() => setShowKitchen(true)} type="button">
            Mostrar cocina
          </button>
          {showKitchen ? (
            <KitchenBoardView />
          ) : (
            <OrderDetailView orderId="A-107" />
          )}
        </>
      );
    }

    renderKitchen(<IntegratedHarness />);
    await user.click(screen.getByRole("button", { name: "Agregar producto" }));
    await user.click(screen.getByRole("button", { name: /Edamame picante/ }));
    await user.click(
      screen.getByRole("button", { name: "Agregar a la cuenta" }),
    );
    await user.click(screen.getByRole("button", { name: "Enviar cambio" }));
    await user.click(screen.getByRole("button", { name: "Confirmar cambio" }));
    await user.click(screen.getByRole("button", { name: "Mostrar cocina" }));

    expect(screen.getByText("Nuevo: Edamame picante (1)")).toBeInTheDocument();
    expect(
      screen.queryByText("Nuevo: Wok teriyaki (2)"),
    ).not.toBeInTheDocument();
  });
});
