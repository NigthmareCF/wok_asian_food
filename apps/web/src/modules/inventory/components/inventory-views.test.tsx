import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { InventorySessionProvider } from "../inventory-session-provider";
import { InventoryListView } from "./inventory-list-view";
import { InventoryDetailView } from "./inventory-detail-view";

afterEach(cleanup);

const renderInventory = (view: React.ReactNode = <InventoryListView />) =>
  render(<InventorySessionProvider>{view}</InventorySessionProvider>);

describe("Inventory views", () => {
  it("does not link to the non-existent new-entry route", () => {
    renderInventory();
    expect(
      screen.queryByRole("link", { name: /Nueva entrada/ }),
    ).not.toBeInTheDocument();
  });

  it("registers a stock entry from the item detail", async () => {
    const user = userEvent.setup();
    renderInventory(<InventoryDetailView itemId="inv-001" />);

    await user.click(
      screen.getByRole("button", { name: /Registrar entrada/ }),
    );
    const dialog = screen.getByRole("dialog", { name: "Registrar entrada" });
    await user.type(within(dialog).getByPlaceholderText("0"), "10");
    fireEvent.change(
      within(dialog).getByLabelText(/Fecha de vencimiento/),
      { target: { value: "2027-01-15" } },
    );
    await user.type(
      within(dialog).getByPlaceholderText("Nombre del proveedor"),
      "Distribuidora Asia",
    );
    await user.type(within(dialog).getByPlaceholderText("0.00"), "19");
    await user.click(
      within(dialog).getByRole("button", { name: /Confirmar entrada/ }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      /Entrada de 10 kg registrada/,
    );
    expect(screen.getAllByText("34 kg").length).toBeGreaterThan(0);
  });

  it("adjusts stock down with a reason", async () => {
    const user = userEvent.setup();
    renderInventory(<InventoryDetailView itemId="inv-003" />);

    await user.click(screen.getByRole("button", { name: /Ajustar stock/ }));
    const dialog = screen.getByRole("dialog", { name: "Ajustar stock" });
    await user.type(within(dialog).getByPlaceholderText("-2"), "-1");
    await user.click(
      within(dialog).getByRole("button", { name: /Confirmar ajuste/ }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      /Ajuste de -1 kg registrado \(Daño\)/,
    );
  });
});