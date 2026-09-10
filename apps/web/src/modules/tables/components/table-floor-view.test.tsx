import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { TableSessionProvider } from "../table-session-provider";
import { TableFloorView } from "./table-floor-view";

afterEach(cleanup);

describe("TableFloorView", () => {
  const renderFloor = () =>
    render(
      <TableSessionProvider>
        <TableFloorView />
      </TableSessionProvider>,
    );

  it("filters tables by state", async () => {
    const user = userEvent.setup();
    renderFloor();

    await user.click(screen.getByRole("button", { name: "Libres 2" }));

    expect(screen.getByRole("link", { name: /Mesa 2/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Mesa 3/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Mesa 1/ }),
    ).not.toBeInTheDocument();
  });

  it("joins adjacent free tables with their effective capacity", async () => {
    const user = userEvent.setup();
    renderFloor();

    await user.click(screen.getByRole("button", { name: "Unir mesas" }));
    const confirmButton = screen.getByRole("button", {
      name: "Confirmar unión",
    });

    expect(confirmButton).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Seleccionar mesa 2" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Seleccionar mesa 3" }),
    );
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Mesas 2 y 3 unidas. Capacidad combinada: 6 personas.",
    );
    expect(screen.getByText("2 + 3")).toBeInTheDocument();
    expect(screen.getByText("6 personas")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ver detalle de mesas 2 y 3" }),
    ).toHaveAttribute("href", "/operation/tables/joined-table-2-table-3");
  });

  it("restores both tables after confirming separation", async () => {
    const user = userEvent.setup();
    renderFloor();

    await user.click(screen.getByRole("button", { name: "Unir mesas" }));
    await user.click(
      screen.getByRole("button", { name: "Seleccionar mesa 2" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Seleccionar mesa 3" }),
    );
    await user.click(screen.getByRole("button", { name: "Confirmar unión" }));
    await user.click(
      screen.getByRole("button", { name: "Separar mesas 2 y 3" }),
    );

    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Ambas mesas recuperarán su capacidad, posición y estado libre original.",
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar separación" }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Mesas 2 y 3 separadas y restauradas.",
    );
    expect(screen.getByRole("link", { name: /Mesa 2/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Mesa 3/ })).toBeInTheDocument();
  });

  it("explains why an occupied table cannot be joined", async () => {
    const user = userEvent.setup();
    renderFloor();

    await user.click(screen.getByRole("button", { name: "Unir mesas" }));

    expect(
      screen.getByRole("button", {
        name: "Mesa 1 no disponible: Solo se pueden unir mesas libres",
      }),
    ).toBeDisabled();
  });
});
