import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TableSessionProvider, useTableSession } from "@/modules/tables";
import { OrderSessionProvider } from "../order-session-provider";
import { NewOrderView } from "./new-order-view";
import { OrderDetailView } from "./order-detail-view";
import { OrderListView } from "./order-list-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

afterEach(cleanup);

const renderWithOrders = (view: React.ReactNode) =>
  render(
    <TableSessionProvider>
      <OrderSessionProvider>{view}</OrderSessionProvider>
    </TableSessionProvider>,
  );

function JoinTablesForTest() {
  const { joinTables } = useTableSession();
  return (
    <button onClick={() => joinTables(["table-2", "table-3"])} type="button">
      Unir mesas de prueba
    </button>
  );
}

describe("Order views", () => {
  it("filters the operational list by delayed orders", async () => {
    const user = userEvent.setup();
    renderWithOrders(<OrderListView />);

    await user.click(screen.getByRole("button", { name: /Retrasados/ }));

    expect(screen.getByText("#D-088")).toBeInTheDocument();
    expect(screen.queryByText("#A-104")).not.toBeInTheDocument();
  });

  it("adds an available product to the current order", async () => {
    const user = userEvent.setup();
    renderWithOrders(<NewOrderView />);

    await user.click(
      screen.getByRole("button", { name: "Agregar Gyozas de cerdo" }),
    );
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    const cart = screen.getByRole("complementary", { name: "Mesa 1" });
    expect(within(cart).getByText("Gyozas de cerdo")).toBeInTheDocument();
    expect(within(cart).getAllByText("Q 68.00")).toHaveLength(2);
  });

  it("offers a joined table as a single order destination", async () => {
    const user = userEvent.setup();
    renderWithOrders(
      <>
        <JoinTablesForTest />
        <NewOrderView />
      </>,
    );

    await user.click(
      screen.getByRole("button", { name: "Unir mesas de prueba" }),
    );

    const tableSelector = screen.getByLabelText("Mesa");
    expect(
      within(tableSelector).getByRole("option", {
        name: "Mesas 2 y 3 unidas",
      }),
    ).toBeInTheDocument();
    expect(
      within(tableSelector).queryByRole("option", { name: "Mesa 2" }),
    ).not.toBeInTheDocument();
    expect(
      within(tableSelector).queryByRole("option", { name: "Mesa 3" }),
    ).not.toBeInTheDocument();
    await user.selectOptions(tableSelector, "Mesas 2 y 3 unidas");
    expect(tableSelector).toHaveValue("Mesas 2 y 3 unidas");
  });

  it("requires a reason and records a cancellation", async () => {
    const user = userEvent.setup();
    renderWithOrders(<OrderDetailView orderId="R-041" />);

    await user.click(screen.getByRole("button", { name: "Anular pedido" }));
    const confirmButton = screen.getByRole("button", {
      name: "Confirmar anulación",
    });
    expect(confirmButton).toBeDisabled();

    await user.selectOptions(
      screen.getByLabelText("Motivo de anulación"),
      "Solicitud del cliente",
    );
    await user.click(confirmButton);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Pedido anulado. Motivo registrado: Solicitud del cliente.",
    );
  });
});
