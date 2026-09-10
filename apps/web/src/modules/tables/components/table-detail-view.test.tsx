import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { operationalTables, tableOrderItems } from "@/data/fixtures/operation";
import { TableDetailView } from "./table-detail-view";

afterEach(cleanup);

describe("TableDetailView", () => {
  it("blocks release until the pending balance is paid", async () => {
    const user = userEvent.setup();
    const table = operationalTables.find((item) => item.id === "table-9");

    expect(table).toBeDefined();
    if (!table) return;

    render(
      <TableDetailView
        initialTable={table}
        items={tableOrderItems[table.id] ?? []}
      />,
    );

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
});
