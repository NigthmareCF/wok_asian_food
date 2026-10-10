import { installPrivateSession } from "@/test/private-session-fixture";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OperationalTableDetailView } from "./operational-table-detail-view";

vi.mock("@/modules/payments/financial-attempt-provider", () => ({
  useFinancialAttempts: () => ({ permissions: ["accounts:manage"] }),
}));
vi.mock(
  "@/modules/client-order-tracking/use-pickup-resource",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("@/modules/client-order-tracking/use-pickup-resource")
      >();
    return {
      usePickupResource: (
        ...args: Parameters<typeof original.usePickupResource>
      ) =>
        args[0].includes("/accounts?")
          ? { data: [], error: null, reload: () => {} }
          : original.usePickupResource(...args),
    };
  },
);
const table = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Mesa prueba",
  capacity: 4,
  zone: "PRUEBAS",
  active: true,
  status: "FREE",
  rowVersion: 1,
  updatedAt: "2026-10-08T10:00:00Z",
  accountId: null,
  accountName: null,
  accountStatus: null,
};
const occupied = { ...table, status: "OCCUPIED", rowVersion: 2 };
const transport = vi.fn<typeof fetch>();
beforeEach(() => {
  transport.mockReset();
  installPrivateSession(transport);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("confirms opening and loads the current table without repeating the mutation", async () => {
  transport
    .mockResolvedValueOnce(Response.json([table]))
    .mockResolvedValueOnce(Response.json(occupied))
    .mockResolvedValueOnce(Response.json([occupied]));
  render(<OperationalTableDetailView tableId={table.id} />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Abrir mesa" }),
  );
  expect(await screen.findByText("Mesa abierta.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Abrir mesa" })).toBeDisabled();
  expect(transport).toHaveBeenNthCalledWith(
    2,
    `/bff/operational/tables/${table.id}/open`,
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "X-Request-Id": expect.any(String) }),
    }),
  );
});

it.each(["network", "invalid", "server"])(
  "reconciles an uncertain %s result before allowing another operation",
  async (failure) => {
    const mocked = transport.mockResolvedValueOnce(Response.json([table]));
    if (failure === "network")
      mocked.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    else
      mocked.mockResolvedValueOnce(
        Response.json({}, { status: failure === "server" ? 503 : 200 }),
      );
    mocked.mockResolvedValueOnce(Response.json([occupied]));
    render(<OperationalTableDetailView tableId={table.id} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Abrir mesa" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos confirmar el resultado",
    );
    expect(screen.getByText("Ocupada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir mesa" })).toBeDisabled();
    expect(screen.queryByText("Mesa abierta.")).not.toBeInTheDocument();
    expect(transport).toHaveBeenCalledTimes(3);
  },
);

it("preserves the reason for a rejected close and refreshes the table", async () => {
  transport
    .mockResolvedValueOnce(Response.json([occupied]))
    .mockResolvedValueOnce(
      Response.json(
        { message: "La mesa tiene pedidos que todavía no se han cerrado." },
        { status: 409 },
      ),
    )
    .mockResolvedValueOnce(Response.json([occupied]));
  render(<OperationalTableDetailView tableId={table.id} />);
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Finalizar cuentas y liberar mesa",
    }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar liberación" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "pedidos que todavía no se han cerrado",
  );
  expect(transport).toHaveBeenCalledTimes(3);
});

it.each([401, 403])(
  "blocks mutations after HTTP %s even if reading is still allowed",
  async (status) => {
    transport
      .mockResolvedValueOnce(Response.json([table]))
      .mockResolvedValueOnce(Response.json({}, { status }))
      .mockResolvedValueOnce(Response.json([table]));
    render(<OperationalTableDetailView tableId={table.id} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Abrir mesa" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      status === 401 ? "sesión venció" : "No tienes permiso",
    );
    expect(screen.getByRole("button", { name: "Abrir mesa" })).toBeDisabled();
  },
);

it("does not offer mutations when reconciliation fails and allows retrying only the read", async () => {
  transport
    .mockResolvedValueOnce(Response.json([table]))
    .mockRejectedValueOnce(new TypeError("Network"))
    .mockRejectedValueOnce(new TypeError("Network"))
    .mockResolvedValueOnce(Response.json([occupied]));
  render(<OperationalTableDetailView tableId={table.id} />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Abrir mesa" }),
  );
  await screen.findByRole("alert");
  expect(
    screen.queryByRole("button", { name: "Abrir mesa" }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Actualizar" }));
  expect(await screen.findByText("Ocupada")).toBeInTheDocument();
  expect(
    transport.mock.calls.filter(([, options]) => options?.method === "POST"),
  ).toHaveLength(1);
});

it("prevents duplicate clicks while a mutation is pending", async () => {
  let resolveAction!: (value: Response) => void;
  transport
    .mockResolvedValueOnce(Response.json([table]))
    .mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveAction = resolve;
      }),
    )
    .mockResolvedValueOnce(Response.json([occupied]));
  render(<OperationalTableDetailView tableId={table.id} />);
  await userEvent.dblClick(
    await screen.findByRole("button", { name: "Abrir mesa" }),
  );
  expect(transport).toHaveBeenCalledTimes(2);
  resolveAction(Response.json(occupied));
  await waitFor(() =>
    expect(screen.getByText("Mesa abierta.")).toBeInTheDocument(),
  );
});

it("does not allow opening an inactive table", async () => {
  transport.mockResolvedValue(Response.json([{ ...table, active: false }]));
  render(<OperationalTableDetailView tableId={table.id} />);
  expect(
    await screen.findByRole("button", { name: "Abrir mesa" }),
  ).toBeDisabled();
});
