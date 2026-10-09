import { installPrivateSession } from "@/test/private-session-fixture";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FinancialAttemptProvider } from "@/modules/payments/financial-attempt-provider";
import { OperationalTableDetailView } from "./operational-table-detail-view";
const id = "20000000-0000-4000-8000-000000000001",
  other = "30000000-0000-4000-8000-000000000001";
const table = {
  id,
  name: "Mesa real",
  capacity: 4,
  zone: "Principal",
  active: true,
  status: "OCCUPIED",
  rowVersion: 1,
  updatedAt: "2026-10-06T00:00:00Z",
  accountId: id,
  accountName: "Primera",
  accountStatus: "PAID",
};
const balance = (accountId: string, n: number, unfinished = 0) => ({
  account: {
    id: accountId,
    name: accountId === id ? "Primera" : "Segunda",
    status: n > 0 ? "OPEN" : "PAID",
    diningTableId: id,
    diningTableName: "Mesa real",
    rowVersion: 1,
  },
  total: 20,
  paid: 20 - n,
  balance: n,
  tips: 0,
  currencies: ["GTQ"],
  currencyTotals: [
    { currency: "GTQ", total: 20, paid: 20 - n, balance: n, tips: 0 },
  ],
  pendingOrderCount: 0,
  unfinalizedOrderCount: unfinished,
});
let accounts = [balance(id, 0), balance(other, 20)],
  writes: number;
beforeEach(() => {
  sessionStorage.clear();
  writes = 0;
  accounts = [balance(id, 0), balance(other, 20)];
  installPrivateSession(
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        writes++;
        return Response.json({
          ...table,
          status: "CLEANING",
          accountId: null,
          accountName: null,
          accountStatus: null,
        });
      }
      return Response.json(url.includes("/accounts?") ? accounts : [table]);
    }),
    () => other,
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const show = (permissions = ["accounts:manage"]) =>
  render(
    <FinancialAttemptProvider userId={other} permissions={permissions}>
      <OperationalTableDetailView tableId={id} />
    </FinancialAttemptProvider>,
  );
it("does not release a table while any of its accounts has debt or an unfinished order", async () => {
  const u = userEvent.setup();
  show();
  await screen.findByText("Todas las cuentas de la mesa");
  await screen.findByText("Segunda · Abierta");
  expect(writes).toBe(0);
  expect(
    screen.getByRole("button", { name: "Finalizar cuentas y liberar mesa" }),
  ).toBeDisabled();
  accounts = [balance(id, 0), balance(other, 0, 1)];
  await u.click(screen.getByRole("button", { name: "Actualizar cuentas" }));
  await screen.findByText("1 pedidos sin finalizar");
  expect(writes).toBe(0);
  expect(
    screen.getByRole("button", { name: "Finalizar cuentas y liberar mesa" }),
  ).toBeDisabled();
  accounts = [balance(id, 0), balance(other, 0)];
  await u.click(screen.getByRole("button", { name: "Actualizar cuentas" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Finalizar cuentas y liberar mesa" }),
    ).toBeEnabled(),
  );
  await u.click(
    screen.getByRole("button", { name: "Finalizar cuentas y liberar mesa" }),
  );
  expect(writes).toBe(0);
  await u.click(screen.getByRole("button", { name: "Confirmar liberación" }));
  await waitFor(() => expect(writes).toBe(1));
  await screen.findByText("Mesa cerrada y enviada a limpieza.");
});
it("financial permission alone allows consultation but does not grant release", async () => {
  accounts = [balance(id, 0), balance(other, 0)];
  show(["payments:manage"]);
  await screen.findByText("Todas las cuentas de la mesa");
  expect(
    screen.getByRole("button", { name: "Finalizar cuentas y liberar mesa" }),
  ).toBeDisabled();
  expect(writes).toBe(0);
});
