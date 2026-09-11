import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { operationalTables, tableOrderItems } from "@/data/fixtures/operation";
import { TableSessionProvider } from "../table-session-provider";
import { TableDetailView } from "./table-detail-view";
import { TableFloorView } from "./table-floor-view";

afterEach(cleanup);

describe("TableDetailView", () => {
  const renderDetail = (table: (typeof operationalTables)[number]) =>
    render(
      <TableSessionProvider>
        <TableDetailView
          initialTable={table}
          items={tableOrderItems[table.id] ?? []}
        />
      </TableSessionProvider>,
    );

  it("blocks release until the pending balance is paid", async () => {
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
    await user.click(screen.getByRole("button", { name: "Confirmar cobro" }));

    expect(releaseButton).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "La mesa ya puede liberarse",
    );
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
          <button onClick={() => setShowDetail(false)} type="button">
            Mostrar mapa
          </button>
          {showDetail ? (
            <TableDetailView initialTable={tableForNavigation} items={[]} />
          ) : (
            <TableFloorView />
          )}
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
});
