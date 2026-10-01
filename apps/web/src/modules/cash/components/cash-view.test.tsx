import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { CashSessionProvider } from "../cash-session-provider";
import { CashView } from "./cash-view";

afterEach(cleanup);

const renderCash = () =>
  render(
    <CashSessionProvider>
      <CashView />
    </CashSessionProvider>,
  );

describe("CashView", () => {
  it("registers an income movement and updates the totals", async () => {
    const user = userEvent.setup();
    renderCash();

    await user.click(screen.getByRole("button", { name: /Registrar ingreso/ }));
    const dialog = screen.getByRole("dialog", { name: "Registrar ingreso" });
    await user.type(
      within(dialog).getByPlaceholderText("Ej. Cobro Mesa 5"),
      "Venta delivery extra",
    );
    await user.type(within(dialog).getByPlaceholderText("0.00"), "100");
    await user.click(
      within(dialog).getByRole("button", { name: /Confirmar registro/ }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      /Ingreso de Q\s*100\.00 registrado/,
    );
    expect(screen.getByText(/\+ Q\s*1,581\.00/)).toBeInTheDocument();
  });

  it("closes the cash register with the counted amount", async () => {
    const user = userEvent.setup();
    renderCash();

    await user.click(screen.getByRole("button", { name: /Cerrar caja/ }));
    const dialog = screen.getByRole("dialog", { name: "Cerrar caja" });
    const expectedText = within(dialog).getByText(/Efectivo esperado:/);
    const expectedValue = parseFloat(
      (expectedText.querySelector("strong")?.textContent ?? "").replace(
        /[^\d.]/g,
        "",
      ),
    );
    await user.type(within(dialog).getByPlaceholderText(/^Q/), String(expectedValue));
    await user.click(
      within(dialog).getByRole("button", { name: /Confirmar cierre/ }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(/Cierre de caja ejecutado/);
    expect(screen.getByRole("status")).toHaveTextContent(/Cuadre perfecto/);
    expect(screen.getAllByText("Cerrada").length).toBeGreaterThan(0);
  });
});