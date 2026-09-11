import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TableSessionProvider,
  useTableSession,
} from "../table-session-provider";
import { JoinedTableDetailView } from "./joined-table-detail-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

afterEach(cleanup);

function JoinedTableHarness() {
  const { joinedGroups, joinTables } = useTableSession();
  const group = joinedGroups[0];

  return group ? (
    <JoinedTableDetailView groupId={group.id} />
  ) : (
    <button onClick={() => joinTables(["table-2", "table-3"])} type="button">
      Crear unión
    </button>
  );
}

describe("JoinedTableDetailView", () => {
  it("allows reserving and opening a joined table before adding its account", async () => {
    const user = userEvent.setup();
    render(
      <TableSessionProvider>
        <JoinedTableHarness />
      </TableSessionProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Crear unión" }));
    await user.click(screen.getByRole("button", { name: "Asignar reserva" }));
    await user.click(screen.getByLabelText(/14:45.*Hugo Castillo/));
    await user.click(
      screen.getByRole("button", { name: "Asignar reservación" }),
    );

    expect(screen.getAllByText("Reservada").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Hugo Castillo/).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Recibir reserva" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Reserva recibida; mesas abiertas por Antony.",
    );
    expect(
      screen.getByRole("link", { name: "Agregar cuenta" }),
    ).toHaveAttribute("href", "/operation/orders/new?tables=2,3");
    expect(
      screen.getByRole("button", { name: "Separar mesas" }),
    ).toBeDisabled();
  });
});
