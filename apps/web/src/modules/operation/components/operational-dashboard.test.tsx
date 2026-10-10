import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OperationalDashboard } from "./operational-dashboard-view";
const id = "11111111-1111-4111-8111-111111111111";
const table = {
  id,
  name: "Mesa",
  capacity: 4,
  zone: "Principal",
  active: true,
  status: "OCCUPIED",
  rowVersion: 1,
  updatedAt: "2026-10-09T10:00:00Z",
  accountId: null,
  accountName: null,
  accountStatus: null,
};
const station = {
  stationId: id,
  stationCode: "WOK",
  queued: 7,
  preparing: 3,
  ready: 2,
  oldestQueuedAt: null,
};
const order = {
  id,
  code: "PERSISTED-123",
  status: "READY",
  channel: "DINE_IN",
  subtotal: 100,
  discount: 0,
  total: 100,
  guestCount: 2,
  openedAt: "2026-10-09T10:00:00Z",
  closedAt: null,
  rowVersion: 1,
  currencyId: id,
  currency: "GTQ",
  diningTableId: null,
  diningTableName: null,
  accountId: id,
  accountName: "Cuenta",
  itemCount: 4,
};
beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      Response.json(
        url.includes("tables")
          ? [table]
          : url.includes("kitchen")
            ? [station]
            : [order],
      ),
    ),
  ),
);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("shows persisted counts and bounded orders without inventing percentages or ETA", async () => {
  render(<OperationalDashboard />);
  expect(await screen.findByText("Ocupadas: 1")).toBeVisible();
  expect(await screen.findByText(/En cola: 7/)).toHaveTextContent(
    "Preparando: 3 · Listos: 2",
  );
  expect(await screen.findByText("PERSISTED-123")).toBeVisible();
  expect(screen.getByText(/máximo 200/)).toBeVisible();
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  expect(screen.queryByText(/Datos simulados/)).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Ver mesas" })).toHaveAttribute(
    "href",
    "/operation/tables",
  );
});
it("keeps forbidden kitchen data independent and retries without fixtures", async () => {
  vi.mocked(fetch).mockImplementation(async (url) =>
    String(url).includes("kitchen")
      ? Response.json({ message: "Sin permiso de cocina" }, { status: 403 })
      : Response.json([]),
  );
  render(<OperationalDashboard />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Sin permiso de cocina",
  );
  expect(await screen.findByText("No hay mesas activas.")).toBeVisible();
  vi.mocked(fetch).mockResolvedValue(Response.json([]));
  await userEvent.click(
    screen.getByRole("button", { name: "Actualizar cocina" }),
  );
  expect(await screen.findByText("No hay estaciones activas.")).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("shows loading and rejects invalid upstream data", async () => {
  let resolve!: (response: Response) => void;
  vi.mocked(fetch).mockImplementation(
    () =>
      new Promise<Response>((r) => {
        resolve = r;
      }),
  );
  render(<OperationalDashboard />);
  expect(screen.getAllByRole("status")).toHaveLength(3);
  resolve(
    Response.json([
      {
        stationId: id,
        stationCode: "WOK",
        queued: -1,
        preparing: 0,
        ready: 0,
        oldestQueuedAt: null,
      },
    ]),
  );
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(screen.queryByText(/En cola: -1/)).not.toBeInTheDocument();
});
