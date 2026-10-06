import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  testDetails,
  testId,
  testMenu,
  testOrder,
  testReceipt,
  testTable,
} from "@/data/fixtures/operational-api-test";
import { NewOrderView } from "./new-order-view";
import { OrderDetailView } from "./order-detail-view";
import { OrderListView } from "./order-list-view";
let sequence = 40;
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("crypto", { randomUUID: () => testId(sequence++) });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function sources(post?: (options: RequestInit) => Promise<Response>) {
  vi.mocked(fetch).mockImplementation(async (url, options) => {
    if (options?.method === "POST")
      return post ? post(options) : Response.json(testReceipt, { status: 201 });
    if (String(url) === "/bff/menu") return Response.json(testMenu);
    return Response.json([
      testTable,
      {
        ...testTable,
        id: testId(11),
        name: "Mesa segunda",
        accountId: testId(12),
      },
      {
        ...testTable,
        id: testId(13),
        accountId: testId(14),
        accountStatus: "IN_COBRO",
      },
    ]);
  });
}
async function prepare() {
  const user = userEvent.setup();
  render(<NewOrderView initialAccountId={testTable.accountId} />);
  await user.click(
    await screen.findByRole("button", { name: "Agregar Arroz de prueba" }),
  );
  return user;
}
it("lists real orders, filters and shows server total", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json([testOrder]));
  const user = userEvent.setup();
  render(<OrderListView />);
  expect(await screen.findByText(testOrder.code)).toBeInTheDocument();
  expect(screen.getByText(/85[.,]00/)).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Estado"), "READY");
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      "/bff/operational/orders?status=READY",
      expect.anything(),
    ),
  );
});
it("creates only from an OPEN account without client totals", async () => {
  sources();
  const user = await prepare();
  expect(
    screen.queryByRole("option", { name: /IN_COBRO/ }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Crear pedido" }));
  expect(await screen.findByText(/Pedido creado:/)).toHaveTextContent(
    testOrder.code,
  );
  expect(screen.getByText(/Total confirmado:/)).toHaveTextContent(/85[.,]00/);
  const call = vi
    .mocked(fetch)
    .mock.calls.find((c) => c[1]?.method === "POST")!;
  expect(JSON.parse(String(call[1]?.body))).toEqual({
    accountId: testTable.accountId,
    channel: "DINE_IN",
    guestCount: 1,
    notes: "",
    items: [
      { menuItemId: testId(8), quantity: 1, fulfillment: "DINE_IN", notes: "" },
    ],
  });
  expect(screen.getByRole("button", { name: "Crear pedido" })).toBeDisabled();
});
it("blocks sending without an open account", async () => {
  vi.mocked(fetch).mockImplementation(async (url) =>
    Response.json(String(url) === "/bff/menu" ? testMenu : []),
  );
  render(<NewOrderView />);
  expect(await screen.findByText(/Abre una mesa/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Crear pedido" })).toBeDisabled();
});
it("blocks duplicate submits while the request is unresolved", async () => {
  let finish!: (r: Response) => void;
  sources(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  await prepare();
  const form = screen.getByRole("form", { name: "Crear pedido" });
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(
    vi.mocked(fetch).mock.calls.filter((c) => c[1]?.method === "POST"),
  ).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Enviando…" })).toBeDisabled();
  finish(Response.json(testReceipt, { status: 201 }));
  await screen.findByText(/Pedido creado:/);
});
it("keeps the retry key only until the account or notes change", async () => {
  sources(async () => Response.json({ message: "Incierto" }, { status: 503 }));
  const user = await prepare();
  const submit = () =>
    user.click(screen.getByRole("button", { name: "Crear pedido" }));
  const keys = () =>
    vi
      .mocked(fetch)
      .mock.calls.filter((c) => c[1]?.method === "POST")
      .map((c) => (c[1]?.headers as Record<string, string>)["Idempotency-Key"]);
  await submit();
  await screen.findByRole("alert");
  await submit();
  expect(keys()[1]).toBe(keys()[0]);
  await user.selectOptions(screen.getByLabelText("Cuenta abierta"), testId(12));
  await submit();
  expect(keys()[2]).not.toBe(keys()[1]);
  await user.type(screen.getByLabelText("Notas del producto"), "Sin sal");
  await submit();
  expect(keys()[3]).not.toBe(keys()[2]);
});
it("reloads accounts and menu after creation conflict", async () => {
  sources(async () => Response.json({}, { status: 409 }));
  const user = await prepare();
  await user.click(screen.getByRole("button", { name: "Crear pedido" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("409");
  await waitFor(() =>
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter((c) => c[0] === "/bff/operational/tables"),
    ).toHaveLength(2),
  );
});
it("renders detail from server data and disables unsupported actions", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json(testDetails));
  render(<OrderDetailView orderId={testOrder.id} />);
  await screen.findByRole("heading", { name: testOrder.code });
  for (const name of [
    "Editar líneas",
    "Agregar productos al pedido",
    "Modificar extras",
    "Cambiar ETA",
    "Dividir cuenta",
    "Cobrar",
  ])
    expect(screen.getByRole("button", { name })).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "Marcar listo" }),
  ).not.toBeInTheDocument();
});
it("sends the current version and refreshes after 409", async () => {
  let gets = 0;
  vi.mocked(fetch).mockImplementation(async (_url, options) => {
    if (options?.method === "PATCH") return Response.json({}, { status: 409 });
    return Response.json({
      ...testDetails,
      order: {
        ...testOrder,
        status: ++gets === 1 ? "READY" : "SERVED",
        rowVersion: gets === 1 ? 6 : 7,
      },
    });
  });
  const user = userEvent.setup();
  render(<OrderDetailView orderId={testOrder.id} />);
  await user.click(
    await screen.findByRole("button", { name: "Marcar servido" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Recargamos");
  await screen.findByRole("button", { name: "Cerrar pedido" });
  expect(
    JSON.parse(
      String(
        vi.mocked(fetch).mock.calls.find((c) => c[1]?.method === "PATCH")?.[1]
          ?.body,
      ),
    ),
  ).toEqual({ status: "SERVED", expectedVersion: 6 });
  expect(
    screen.queryByRole("button", { name: "Marcar servido" }),
  ).not.toBeInTheDocument();
});
it("requires confirmation before cancellation", async () => {
  vi.mocked(fetch).mockImplementation(async (_url, options) =>
    Response.json(
      options?.method === "PATCH"
        ? { ...testOrder, status: "CANCELLED" }
        : testDetails,
    ),
  );
  const user = userEvent.setup();
  render(<OrderDetailView orderId={testOrder.id} />);
  await user.click(
    await screen.findByRole("button", { name: "Anular pedido" }),
  );
  expect(
    vi.mocked(fetch).mock.calls.filter((c) => c[1]?.method === "PATCH"),
  ).toHaveLength(0);
  await user.type(
    screen.getByLabelText("Motivo de anulación"),
    "Cliente cancela",
  );
  await user.click(screen.getByRole("button", { name: "Confirmar anulación" }));
  await waitFor(() =>
    expect(
      vi.mocked(fetch).mock.calls.some((c) => c[1]?.method === "PATCH"),
    ).toBe(true),
  );
  expect(
    JSON.parse(
      String(
        vi.mocked(fetch).mock.calls.find((c) => c[1]?.method === "PATCH")?.[1]
          ?.body,
      ),
    ),
  ).toMatchObject({
    status: "CANCELLED",
    expectedVersion: 2,
    reason: "Cliente cancela",
  });
});
it.each([401, 403, 404, 500])(
  "shows detail error %s without actions",
  async (status) => {
    vi.mocked(fetch).mockResolvedValue(Response.json({}, { status }));
    render(<OrderDetailView orderId={testOrder.id} />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Anular pedido" }),
    ).not.toBeInTheDocument();
  },
);
