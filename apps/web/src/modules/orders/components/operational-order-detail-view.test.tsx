import { installPrivateSession } from "@/test/private-session-fixture";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FinancialAttemptProvider } from "@/modules/payments/financial-attempt-provider";
import { OperationalOrderDetailView } from "./operational-order-detail-view";
const id = "20000000-0000-4000-8000-000000000001";
const order = {
  id,
  code: "Real servido",
  status: "SERVED",
  channel: "DINE_IN",
  subtotal: 20,
  discount: 0,
  total: 20,
  guestCount: 2,
  openedAt: "2026-10-06T00:00:00Z",
  closedAt: null,
  rowVersion: 3,
  currencyId: id,
  currency: "GTQ",
  diningTableId: id,
  diningTableName: "Mesa",
  accountId: id,
  accountName: "Cuenta",
  itemCount: 0,
};
const initial = {
  account: {
    id,
    name: "Cuenta",
    status: "OPEN",
    diningTableId: id,
    diningTableName: "Mesa",
    rowVersion: 1,
  },
  total: 20,
  paid: 0,
  balance: 20,
  tips: 0,
  currencies: ["GTQ"],
  currencyTotals: [
    { currency: "GTQ", total: 20, paid: 0, balance: 20, tips: 0 },
  ],
  pendingOrderCount: 0,
  unfinalizedOrderCount: 1,
  orders: [],
  payments: [],
};
let account = structuredClone(initial),
  writes: RequestInit[];
beforeEach(() => {
  sessionStorage.clear();
  account = structuredClone(initial);
  writes = [];
  installPrivateSession(
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "PATCH") {
        writes.push(init);
        return Response.json({ ...order, status: "CLOSED", rowVersion: 4 });
      }
      return Response.json(
        url.includes("/accounts/")
          ? account
          : { order, items: [], tickets: [] },
      );
    }),
    () => id,
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const show = (permissions = ["orders:manage", "accounts:manage"]) =>
  render(
    <FinancialAttemptProvider userId={id} permissions={permissions}>
      <OperationalOrderDetailView orderId={id} />
    </FinancialAttemptProvider>,
  );
it("keeps served separate from financial finalization until the whole account is paid", async () => {
  const u = userEvent.setup();
  show();
  await screen.findByRole("button", {
    name: "Finalizar pedido con saldo cero",
  });
  expect(
    screen.getByRole("button", { name: "Finalizar pedido con saldo cero" }),
  ).toBeDisabled();
  account.balance = 0;
  account.paid = 20;
  account.currencyTotals[0].balance = 0;
  account.currencyTotals[0].paid = 20;
  account.pendingOrderCount = 1;
  await u.click(
    screen.getByRole("button", { name: "Actualizar verificación financiera" }),
  );
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(
    screen.getByRole("button", { name: "Finalizar pedido con saldo cero" }),
  ).toBeDisabled();
  account.pendingOrderCount = 0;
  await u.click(
    screen.getByRole("button", { name: "Actualizar verificación financiera" }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Finalizar pedido con saldo cero" }),
    ).toBeEnabled(),
  );
  await u.click(
    screen.getByRole("button", { name: "Finalizar pedido con saldo cero" }),
  );
  await u.click(screen.getByRole("button", { name: "Confirmar finalización" }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(JSON.parse(String(writes[0].body))).toEqual({
    status: "CLOSED",
    expectedVersion: 3,
  });
});
it("does not grant finalization to a financial-only operator", async () => {
  account.balance = 0;
  account.currencyTotals[0].balance = 0;
  show(["payments:manage"]);
  await screen.findByRole("button", {
    name: "Finalizar pedido con saldo cero",
  });
  expect(
    screen.getByRole("button", { name: "Finalizar pedido con saldo cero" }),
  ).toBeDisabled();
});
