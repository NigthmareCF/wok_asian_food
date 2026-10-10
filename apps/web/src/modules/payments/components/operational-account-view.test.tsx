import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { OperationalAccountView } from "./operational-account-view";

afterEach(cleanup);
it("muestra saldo calculado por backend y bloqueos sin contrato", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ account: { id: "11111111-1111-4111-8111-111111111111", name: "Cuenta", status: "OPEN" }, orders: [], total: 25, paid: 5, balance: 20, tips: 0, payments: [] })));
  render(<OperationalAccountView accountId="11111111-1111-4111-8111-111111111111" />);
  expect(await screen.findByText(/Saldo/)).toBeInTheDocument();
  expect(screen.getByText(/cierre de cuenta, la precuenta/)).toBeInTheDocument();
  vi.unstubAllGlobals();
});
