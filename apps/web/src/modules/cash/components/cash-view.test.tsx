import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CashSessionProvider } from "../cash-session-provider";
import { CashView } from "./cash-view";

afterEach(cleanup);

const session = {
  id: "11111111-1111-4111-8111-111111111111",
  registerCode: "MAIN",
  status: "OPEN",
  expectedCash: 500,
  countedCash: null,
  difference: null,
  openedBy: "22222222-2222-4222-8222-222222222222",
  openedAt: "2026-10-09T08:00:00Z",
  closedBy: null,
  closedAt: null,
  rowVersion: 1,
  breakdown: {
    opening: 500,
    sales: 0,
    tips: 0,
    income: 0,
    expenses: 0,
    withdrawals: 0,
    balance: 500,
  },
  reconciliations: [],
  movements: [],
};

function renderCash() {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(session), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "33333333-3333-4333-8333-333333333333",
            movementType: "INCOME",
            amountDelta: 100,
            reason: "Venta",
            responsibleUserId: session.openedBy,
            occurredAt: session.openedAt,
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...session,
            expectedCash: 600,
            breakdown: { ...session.breakdown, income: 100, balance: 600 },
            movements: [
              {
                id: "33333333-3333-4333-8333-333333333333",
                movementType: "INCOME",
                amountDelta: 100,
                reason: "Venta",
                responsibleUserId: session.openedBy,
                occurredAt: session.openedAt,
              },
            ],
          }),
          { status: 200 },
        ),
      ),
  );
  return render(
    <CashSessionProvider>
      <CashView />
    </CashSessionProvider>,
  );
}

describe("CashView", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("carga la sesión real y registra movimientos con el DTO del backend", async () => {
    const user = userEvent.setup();
    renderCash();
    await screen.findByText("Control de caja");
    await user.type(screen.getByLabelText("Monto"), "100");
    await user.type(screen.getByLabelText("Motivo"), "Venta");
    await user.click(
      screen.getByRole("button", { name: "Registrar movimiento" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Movimiento registrado",
      ),
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/movements"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("muestra vacío cuando no existe una sesión activa", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ message: "No hay caja" }), {
            status: 404,
          }),
        ),
    );
    render(
      <CashSessionProvider>
        <CashView />
      </CashSessionProvider>,
    );
    expect(
      await screen.findByText(/No hay una sesión abierta/),
    ).toBeInTheDocument();
  });
});
