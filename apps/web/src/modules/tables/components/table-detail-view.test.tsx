import { useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { operationalTables, tableOrderItems } from "@/data/fixtures/operation";
import { OrderSessionProvider, useOrderSession } from "@/modules/orders";
import { TableSessionProvider } from "../table-session-provider";
import { TableDetailView } from "./table-detail-view";
import { TableFloorView } from "./table-floor-view";

afterEach(cleanup);

describe("TableDetailView", () => {
  const renderDetail = (table: (typeof operationalTables)[number]) =>
    render(
      <TableSessionProvider>
        <OrderSessionProvider>
          <TableDetailView
            initialTable={table}
            items={tableOrderItems[table.id] ?? []}
          />
        </OrderSessionProvider>
      </TableSessionProvider>,
    );

  it("blocks release until the payment is registered in payments", async () => {
    const user = userEvent.setup();
    const table = operationalTables.find((item) => item.id === "table-9");

    expect(table).toBeDefined();
    if (!table) return;

    renderDetail(table);

    const releaseButton = screen.getByRole("button", {
      name: "Liberar mesa",
    });
    expect(releaseButton).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Cobrar" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Marcar para cobro" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Mesa marcada como pendiente de cobro. Registra el pago en el módulo de pagos.",
    );
    expect(
      screen.getAllByText("Pendiente de cobro").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(/no se liberará hasta registrar el pago/),
    ).toBeInTheDocument();
    expect(releaseButton).toBeDisabled();
  });

  it("assigns a free table to the user who opens it", async () => {
    const user = userEvent.setup();
    const table = operationalTables.find((item) => item.id === "table-3");

    expect(table).toBeDefined();
    if (!table) return;
    renderDetail(table);

    await user.click(screen.getByRole("button", { name: "Abrir mesa" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Mesa abierta y asignada a Antony.",
    );
    expect(screen.getByText("Usuario que abrió la mesa")).toBeInTheDocument();
    expect(screen.getAllByText("Antony").length).toBeGreaterThan(0);
  });

  it("assigns a compatible reservation to a free table", async () => {
    const user = userEvent.setup();
    const table = operationalTables.find((item) => item.id === "table-3");

    expect(table).toBeDefined();
    if (!table) return;
    renderDetail(table);

    await user.click(screen.getByRole("button", { name: "Asignar reserva" }));
    await user.click(screen.getByLabelText(/14:15.*Valeria Gómez/));
    await user.click(screen.getByRole("button", { name: "Asignar a mesa 3" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Reserva de Valeria Gómez asignada a la mesa 3.",
    );
    expect(screen.getByText("Reservada")).toBeInTheDocument();
  });

  it("keeps table changes while navigating within the operational module", async () => {
    const user = userEvent.setup();
    const table = operationalTables.find((item) => item.id === "table-3");

    expect(table).toBeDefined();
    if (!table) return;
    const tableForNavigation = table;

    function NavigationHarness() {
      const [showDetail, setShowDetail] = useState(true);
      return (
        <TableSessionProvider>
          <OrderSessionProvider>
            <button onClick={() => setShowDetail(false)} type="button">
              Mostrar mapa
            </button>
            {showDetail ? (
              <TableDetailView initialTable={tableForNavigation} items={[]} />
            ) : (
              <TableFloorView />
            )}
          </OrderSessionProvider>
        </TableSessionProvider>
      );
    }

    render(<NavigationHarness />);
    await user.click(screen.getByRole("button", { name: "Asignar reserva" }));
    await user.click(screen.getByLabelText(/14:15.*Valeria Gómez/));
    await user.click(screen.getByRole("button", { name: "Asignar a mesa 3" }));
    await user.click(screen.getByRole("button", { name: "Mostrar mapa" }));

    expect(
      screen.getByRole("link", { name: /Mesa 3, Reservada/ }),
    ).toBeInTheDocument();
  });

  it("explains who manually set an out-of-service table", () => {
    const table = operationalTables.find((item) => item.id === "table-11");

    expect(table).toBeDefined();
    if (!table) return;
    renderDetail(table);

    expect(
      screen.getByText("Operativo · Marco R. · 12:42"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/estado fue establecido manualmente/i),
    ).toBeInTheDocument();
  });

  it("shows orders and their total when returning to an open table", async () => {
    const user = userEvent.setup();
    const table = operationalTables.find((item) => item.id === "table-4");

    expect(table).toBeDefined();
    if (!table) return;

    function CreateOrderForTable() {
      const { createOrder } = useOrderSession();
      return (
        <button
          onClick={() =>
            createOrder({
              channel: "table",
              source: "Mesa 4",
              items: [
                {
                  id: "test-item",
                  productId: "gyoza",
                  name: "Gyozas de cerdo",
                  quantity: 2,
                  unitPrice: 68,
                  modifiers: [],
                },
              ],
            })
          }
          type="button"
        >
          Crear pedido de prueba
        </button>
      );
    }

    render(
      <TableSessionProvider>
        <OrderSessionProvider>
          <CreateOrderForTable />
          <TableDetailView initialTable={table} items={[]} />
        </OrderSessionProvider>
      </TableSessionProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Abrir mesa" }));
    await user.click(
      screen.getByRole("button", { name: "Crear pedido de prueba" }),
    );

    expect(screen.getByText("Gyozas de cerdo")).toBeInTheDocument();
    expect(screen.getAllByText(/136\.00/).length).toBeGreaterThan(0);
  });

  it("opens named accounts before adding their orders", async () => {
    const user = userEvent.setup();
    const table = operationalTables.find((item) => item.id === "table-5");

    expect(table).toBeDefined();
    if (!table) return;
    renderDetail(table);

    await user.click(screen.getByRole("button", { name: "Abrir cuenta" }));
    let dialog = screen.getByRole("dialog");
    await user.type(
      within(dialog).getByLabelText("Nombre de la cuenta"),
      "Pepito",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Abrir cuenta" }),
    );

    await user.click(screen.getByRole("button", { name: "Abrir cuenta" }));
    dialog = screen.getByRole("dialog");
    await user.type(
      within(dialog).getByLabelText("Nombre de la cuenta"),
      "María",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Abrir cuenta" }),
    );

    expect(screen.getByText("Pepito")).toBeInTheDocument();
    expect(screen.getByText("María")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /Agregar productos a la cuenta/ }),
    ).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: /Dividir cuenta/ }),
    ).toBeDisabled();
  });
});
