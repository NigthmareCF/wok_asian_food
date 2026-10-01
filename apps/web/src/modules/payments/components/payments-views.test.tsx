import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { PaymentsSessionProvider } from "../payments-session-provider";
import { PaymentsListView } from "./payments-list-view";
import { PaymentDetailView } from "./payment-detail-view";

afterEach(cleanup);

const renderPayments = (view: React.ReactNode = <PaymentsListView />) =>
  render(<PaymentsSessionProvider>{view}</PaymentsSessionProvider>);

describe("Payments views", () => {
  it("collects the remaining amount of a partial record", async () => {
    const user = userEvent.setup();
    renderPayments(<PaymentDetailView recordId="A-105" />);

    await user.click(screen.getByRole("button", { name: /Registrar pago/ }));
    const dialog = screen.getByRole("dialog", { name: "Registrar pago" });
    await user.type(
      within(dialog).getByPlaceholderText(/Q\s*62\.00/),
      "62",
    );
    await user.click(
      within(dialog).getByRole("button", { name: /Confirmar pago/ }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      /Pago de Q\s*62\.00 registrado/,
    );
    expect(screen.getAllByText("Pagada").length).toBeGreaterThan(0);
  });

  it("applies a tip and shows the updated total", async () => {
    const user = userEvent.setup();
    renderPayments(<PaymentDetailView recordId="A-106" />);

    await user.click(
      screen.getByRole("button", { name: /Agregar propina/ }),
    );
    const dialog = screen.getByRole("dialog", { name: "Agregar propina" });
    await user.type(within(dialog).getByPlaceholderText("Ej. 20.00"), "25");
    await user.click(
      within(dialog).getByRole("button", { name: /Aplicar propina/ }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      /Propina de Q\s*25\.00 aplicada/,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      /Nuevo total: Q\s*175\.00/,
    );
  });

  it("filters the payment list by status", async () => {
    const user = userEvent.setup();
    renderPayments();

    expect(screen.getByText("#A-106")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Pagadas/ }));
    expect(screen.getByText("#A-104")).toBeInTheDocument();
    expect(screen.queryByText("#A-106")).not.toBeInTheDocument();
  });
});