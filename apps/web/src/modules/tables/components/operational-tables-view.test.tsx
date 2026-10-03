import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OperationalTablesView } from "./operational-tables-view";

const tableId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const freeTable = {
  id: tableId,
  name: "Mesa 01",
  capacity: 4,
  zone: "PRINCIPAL",
  active: true,
  status: "FREE",
  rowVersion: 1,
  updatedAt: "2026-10-03T10:00:00Z",
  accountId: null,
  accountName: null,
  accountStatus: null,
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("crypto", { randomUUID: () => requestId });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("loads real tables and filters them without fixture fields", async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json([
      freeTable,
      {
        ...freeTable,
        id: "33333333-3333-4333-8333-333333333333",
        name: "Mesa 02",
        status: "OCCUPIED",
      },
    ]),
  );
  const user = userEvent.setup();
  render(<OperationalTablesView />);

  expect(await screen.findByText("Mesa 01")).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Estado"), "OCCUPIED");
  expect(screen.queryByText("Mesa 01")).not.toBeInTheDocument();
  expect(screen.getByText("Mesa 02")).toBeInTheDocument();
});

it("creates a table with X-Request-Id and reloads the list", async () => {
  const user = userEvent.setup();
  vi.mocked(fetch)
    .mockResolvedValueOnce(Response.json([]))
    .mockResolvedValueOnce(Response.json(freeTable, { status: 201 }))
    .mockResolvedValueOnce(Response.json([freeTable]));
  render(<OperationalTablesView />);

  await screen.findByText("No hay mesas para estos filtros");
  await user.click(screen.getByRole("button", { name: "Nueva mesa" }));
  const creator = within(screen.getByRole("form", { name: "Crear mesa" }));
  await user.type(creator.getByLabelText("Nombre"), "Mesa 01");
  await user.clear(creator.getByLabelText("Capacidad"));
  await user.type(creator.getByLabelText("Capacidad"), "4");
  await user.type(creator.getByLabelText("Zona"), "Principal");
  await user.click(creator.getByRole("button", { name: "Crear mesa" }));

  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Mesa creada."),
  );
  expect(fetch).toHaveBeenNthCalledWith(
    2,
    "/bff/operational/tables",
    expect.objectContaining({
      headers: expect.objectContaining({ "X-Request-Id": requestId }),
    }),
  );
});

it("reloads after a 409 without allowing another table action", async () => {
  const user = userEvent.setup();
  vi.mocked(fetch)
    .mockResolvedValueOnce(Response.json([freeTable]))
    .mockResolvedValueOnce(
      Response.json({ message: "El estado cambió." }, { status: 409 }),
    )
    .mockResolvedValueOnce(Response.json([]));
  render(<OperationalTablesView />);

  await screen.findByText("Mesa 01");
  await user.click(screen.getByRole("button", { name: "Abrir mesa" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Recargamos el listado",
  );
  await waitFor(() =>
    expect(
      screen.getByText("No hay mesas para estos filtros"),
    ).toBeInTheDocument(),
  );
  expect(fetch).toHaveBeenCalledTimes(3);
});
