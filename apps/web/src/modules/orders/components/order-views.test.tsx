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

  it("keeps the table selected when the order starts from its detail", () => {
    renderWithOrders(<NewOrderView initialTableNumber="4" />);

    expect(screen.getByLabelText("Mesa")).toHaveValue("Mesa 4");
    expect(
      screen.getByRole("complementary", { name: "Mesa 4" }),
    ).toBeInTheDocument();
  });

  it("keeps the account and allows takeaway items in a new table order", async () => {
    const user = userEvent.setup();
    renderWithOrders(
      <NewOrderView
        initialAccountId="account-pepito"
        initialAccountName="Pepito"
        initialTableNumber="4"
      />,
    );

    expect(screen.getByLabelText("Cuenta")).toHaveValue("account-pepito");
    expect(screen.getByText("Cuenta de Pepito")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Agregar Gyozas de cerdo" }),
    );
    const dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Para llevar" }),
    );
    await user.type(
      within(dialog).getByLabelText("Hora para retirar"),
      "21:20",
    );
    await user.click(within(dialog).getByRole("button", { name: "Agregar" }));

    expect(screen.getByText(/Para llevar · 21:20/)).toBeInTheDocument();
  });

  it("offers a joined table as a single order destination", async () => {
    const user = userEvent.setup();
    renderWithOrders(
      <>
        <JoinTablesForTest />
        <NewOrderView initialJoinedTableNumbers="2,3" />
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

  it("adds a new product to an existing order as a kitchen update", async () => {
    const user = userEvent.setup();
    renderWithOrders(<OrderDetailView orderId="A-107" />);

    await user.click(screen.getByRole("button", { name: "Agregar producto" }));
    await user.click(screen.getByRole("button", { name: /Gyozas de cerdo/ }));
    await user.click(
      screen.getByRole("button", { name: "Agregar a la cuenta" }),
    );

    expect(screen.getByText("Nuevo para cocina")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Enviar cambio" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "únicamente 1 cambio(s)",
    );
    await user.click(screen.getByRole("button", { name: "Confirmar cambio" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Actualización enviada a cocina",
    );
    expect(screen.getByText("Agregado: Gyozas de cerdo")).toBeInTheDocument();
  });

  it("separates an additional item as takeaway with a pickup time", async () => {
    const user = userEvent.setup();
    renderWithOrders(<OrderDetailView orderId="A-107" />);

    await user.click(screen.getByRole("button", { name: "Para llevar" }));
    await user.click(screen.getByRole("button", { name: /Gyozas de cerdo/ }));
    await user.type(screen.getByLabelText("Hora para retirar"), "21:20");
    await user.type(
      screen.getByLabelText("Indicaciones para llevar (opcional)"),
      "Entregar en bolsa separada",
    );
    await user.click(
      screen.getByRole("button", { name: "Agregar a la cuenta" }),
    );

    expect(screen.getByText(/Para llevar · 21:20/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "agregado para llevar",
    );
  });
});
