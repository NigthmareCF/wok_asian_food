import { installPrivateSession } from "@/test/private-session-fixture";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OperationalOrderBuilder } from "./operational-order-builder";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/modules/menu/use-public-menu", () => ({
  usePublicMenu: () => ({
    menu: {
      categories: [
        {
          id: "category",
          name: "Platos",
          items: [
            {
              id: "30000000-0000-4000-8000-000000000001",
              name: "Arroz",
              price: 20,
              currency: "GTQ",
              estimatedPreparationSeconds: 60,
            },
          ],
        },
      ],
    },
    error: false,
    reload: vi.fn(),
  }),
}));

const accountId = "10000000-0000-4000-8000-000000000001";
const orderId = "20000000-0000-4000-8000-000000000001";
const otherId = "40000000-0000-4000-8000-000000000001";
const modes = [
  { mode: "create", orderId: undefined, label: "Enviar a cocina" },
  { mode: "append", orderId, label: "Agregar a cocina" },
];
const receipt = {
  orderId,
  code: "ORD-TEST",
  status: "SENT",
  channel: "DINE_IN",
  subtotal: 40,
  discount: 0,
  total: 40,
  currency: "GTQ",
  rowVersion: 1,
  itemCount: 1,
  idempotentReplay: false,
};
const details = {
  order: {
    id: orderId,
    code: receipt.code,
    status: "SENT",
    channel: "DINE_IN",
    subtotal: 40,
    discount: 0,
    total: 40,
    guestCount: 2,
    openedAt: "2026-10-07T00:00:00Z",
    closedAt: null,
    rowVersion: 1,
    currencyId: otherId,
    currency: "GTQ",
    diningTableId: otherId,
    diningTableName: "Mesa",
    accountId,
    accountName: "Cuenta",
    itemCount: 1,
  },
  items: [
    {
      id: otherId,
      name: "Arroz",
      quantity: 2,
      unitPrice: 20,
      lineTotal: 40,
      fulfillment: "TAKEAWAY",
      notes: "Sin cebolla",
      preparationAreaId: otherId,
      stationCode: "KITCHEN",
    },
  ],
  tickets: [],
};
const transport = vi.fn<typeof fetch>();
const retry = () =>
  screen.getByRole("button", { name: "Reintentar el mismo envio" });
const success = (mode: string) =>
  Response.json(mode === "create" ? receipt : details);
const request = (index: number) => {
  const [url, init] = transport.mock.calls[index];
  return {
    url,
    body: init?.body,
    key: new Headers(init?.headers).get("Idempotency-Key"),
  };
};
function deferred() {
  let resolve!: (value: Response) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<Response>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function prepare(targetOrderId?: string, userId: string = otherId) {
  const user = userEvent.setup();
  const view = render(
    <OperationalOrderBuilder
      accountId={accountId}
      orderId={targetOrderId}
      userId={userId}
    />,
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Agregar Arroz" })).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "Agregar Arroz" }));
  await user.click(screen.getByRole("button", { name: "Sumar Arroz" }));
  await user.type(screen.getByRole("spinbutton", { name: "Personas" }), "2");
  await user.type(
    screen.getByRole("textbox", { name: "Nota para cocina" }),
    " Sin cebolla ",
  );
  await user.type(
    screen.getByRole("textbox", { name: "Nota general" }),
    " Mesa junto a ventana ",
  );
  await user.click(screen.getByRole("button", { name: "Consumir en mesa" }));
  return { user, ...view };
}
beforeEach(() => {
  push.mockReset();
  transport.mockReset();
  installPrivateSession(transport);
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});
it.each(modes)(
  "$mode: restores a lost request after remount and retries without needing a new cart",
  async ({ mode, orderId: targetOrderId, label }) => {
    transport
      .mockRejectedValueOnce(new Error("lost"))
      .mockResolvedValueOnce(success(mode));
    const first = await prepare(targetOrderId, otherId);
    await first.user.click(screen.getByRole("button", { name: label }));
    await screen.findByText("lost");
    const original = request(0);
    first.unmount();
    render(
      <OperationalOrderBuilder
        accountId={accountId}
        orderId={targetOrderId}
        userId={otherId}
      />,
    );
    const button = screen.getByRole("button", {
      name: "Reintentar el mismo envio",
    });
    await waitFor(() => expect(button).toBeEnabled());
    await first.user.click(button);
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(request(1)).toEqual(original);
  },
);

it.each(modes)(
  "$mode: lost response and same-tick double clicks preserve the exact request",
  async ({ mode, orderId: targetOrderId, label }) => {
    const pending = deferred();
    transport
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(success(mode));
    const { user } = await prepare(targetOrderId);
    const button = screen.getByRole("button", { name: label });
    act(() => {
      button.click();
      button.click();
    });
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
    const original = request(0);
    expect(original.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(original.url).toBe(
      targetOrderId
        ? `/bff/operational/orders/${orderId}/items`
        : "/bff/operational/orders",
    );
    const items = [
      {
        menuItemId: "30000000-0000-4000-8000-000000000001",
        quantity: 2,
        fulfillment: "TAKEAWAY",
        notes: "Sin cebolla",
      },
    ];
    expect(JSON.parse(String(original.body))).toEqual(
      targetOrderId
        ? { items }
        : {
            accountId,
            channel: "DINE_IN",
            guestCount: 12,
            notes: "Mesa junto a ventana",
            items,
          },
    );
    await act(async () => pending.reject(new Error("Respuesta perdida")));
    expect(retry()).toBeEnabled();
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
    expect(push).not.toHaveBeenCalled();
    for (const name of [
      "Agregar Arroz",
      "Sumar Arroz",
      "Restar Arroz",
      "Quitar Arroz",
      "Para llevar",
    ])
      expect(screen.getByRole("button", { name })).toBeDisabled();
    for (const name of ["Nota para cocina", "Nota general"])
      expect(screen.getByRole("textbox", { name })).toBeDisabled();
    expect(screen.getByRole("spinbutton", { name: "Personas" })).toBeDisabled();
    expect(screen.getByText(/El intento se conserva/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sumar Arroz" }));
    const retryButton = retry();
    act(() => {
      retryButton.click();
      retryButton.click();
    });
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(`/operation/orders/${orderId}`),
    );
    expect(transport).toHaveBeenCalledTimes(2);
    expect(request(1)).toEqual(original);
    expect(
      screen.getByRole("button", { name: "Envio confirmado" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Envio confirmado" }));
    expect(transport).toHaveBeenCalledTimes(2);
  },
);

it.each(modes)(
  "$mode: an uncertain attempt cannot move to another account, order or operation",
  async ({ mode, orderId: targetOrderId, label }) => {
    transport
      .mockRejectedValueOnce(new Error("Respuesta perdida"))
      .mockResolvedValueOnce(success(mode));
    const { user, rerender } = await prepare(targetOrderId);
    await user.click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(retry()).toBeEnabled());
    const targets = [
      { accountId: otherId, orderId: targetOrderId },
      { accountId, orderId: targetOrderId ? otherId : orderId },
      { accountId, orderId: targetOrderId ? undefined : orderId },
    ];
    for (const target of targets) {
      rerender(<OperationalOrderBuilder {...target} />);
      expect(retry()).toBeDisabled();
      fireEvent.click(retry());
      expect(
        screen.getByText(/Vuelve a la cuenta y al pedido originales/),
      ).toBeInTheDocument();
      await waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
    }
    rerender(<OperationalOrderBuilder />);
    expect(
      screen.queryByRole("button", { name: "Reintentar el mismo envio" }),
    ).not.toBeInTheDocument();
    rerender(
      <OperationalOrderBuilder
        accountId={accountId}
        orderId={targetOrderId}
        userId={otherId}
      />,
    );
    await user.click(retry());
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
    expect(request(1)).toEqual(request(0));
  },
);

it.each(modes)(
  "$mode: target changes during a request do not redirect the new account",
  async ({ mode, orderId: targetOrderId, label }) => {
    const pending = deferred();
    transport.mockReturnValueOnce(pending.promise);
    const { user, rerender } = await prepare(targetOrderId);
    await user.click(screen.getByRole("button", { name: label }));
    rerender(
      <OperationalOrderBuilder
        accountId={otherId}
        orderId={targetOrderId}
        userId={otherId}
      />,
    );
    await act(async () => pending.resolve(success(mode)));
    expect(push).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Reintentar el mismo envio" }),
    ).toBeDisabled();
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
  },
);

// These BFF rejections are definitive only before any uncertain result.
it.each(
  modes.flatMap((mode) =>
    [400, 401, 403, 404, 422].map((status) => ({ ...mode, status })),
  ),
)(
  "$mode: first definitive rejection $status permits a corrected new attempt",
  async ({ mode, orderId: targetOrderId, label, status }) => {
    transport
      .mockResolvedValueOnce(
        Response.json({ message: "Rechazado" }, { status }),
      )
      .mockResolvedValueOnce(success(mode));
    const { user } = await prepare(targetOrderId);
    await user.click(screen.getByRole("button", { name: label }));
    await screen.findByText("Rechazado");
    expect(screen.getByRole("button", { name: "Sumar Arroz" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Reintentar el mismo envio" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sumar Arroz" }));
    await user.click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
    expect(request(1).key).not.toBe(request(0).key);
    expect(request(1).body).not.toBe(request(0).body);
  },
);

it.each(
  modes.flatMap((mode) =>
    [409, 500, 503].map((status) => ({ ...mode, status })),
  ),
)(
  "$mode: ambiguous response $status preserves the attempt without automatic retries",
  async ({ mode, orderId: targetOrderId, label, status }) => {
    transport
      .mockResolvedValueOnce(
        Response.json({ message: "Resultado incierto" }, { status }),
      )
      .mockResolvedValueOnce(success(mode));
    const { user } = await prepare(targetOrderId);
    await user.click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(retry()).toBeEnabled());
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
    await user.click(retry());
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(request(1)).toEqual(request(0));
  },
);

it.each(modes)(
  "$mode: rejection after a lost response cannot release the original attempt",
  async ({ mode, orderId: targetOrderId, label }) => {
    transport
      .mockRejectedValueOnce(new Error("Respuesta perdida"))
      .mockResolvedValueOnce(
        Response.json({ message: "Rechazado" }, { status: 422 }),
      )
      .mockResolvedValueOnce(success(mode));
    const { user } = await prepare(targetOrderId);
    await user.click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(retry()).toBeEnabled());
    await user.click(retry());
    await screen.findByText("Rechazado");
    expect(screen.getByRole("button", { name: "Sumar Arroz" })).toBeDisabled();
    await user.click(retry());
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(request(1)).toEqual(request(0));
    expect(request(2)).toEqual(request(0));
  },
);

it.each(
  modes.flatMap((mode) =>
    ["invalid-json", "invalid-body"].map((failure) => ({ ...mode, failure })),
  ),
)(
  "$mode: successful status with $failure remains uncertain",
  async ({ mode, orderId: targetOrderId, label, failure }) => {
    transport
      .mockResolvedValueOnce(
        failure === "invalid-json"
          ? new Response("{")
          : Response.json({ orderId }),
      )
      .mockResolvedValueOnce(success(mode));
    const { user } = await prepare(targetOrderId);
    await user.click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(retry()).toBeEnabled());
    expect(push).not.toHaveBeenCalled();
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
    await user.click(retry());
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(request(1)).toEqual(request(0));
  },
);

it.each(["accountId", "id"] as const)(
  "append: mismatched response order.$0 remains uncertain",
  async (field) => {
    transport.mockResolvedValueOnce(
      Response.json({
        ...details,
        order: { ...details.order, [field]: otherId },
      }),
    );
    const { user } = await prepare(orderId);
    await user.click(screen.getByRole("button", { name: "Agregar a cocina" }));
    await waitFor(() => expect(retry()).toBeEnabled());
    expect(push).not.toHaveBeenCalled();
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
  },
);

it("AUDIT: late response after unmount must not navigate", async () => {
  const pending = deferred();
  transport.mockReturnValueOnce(pending.promise);
  const view = await prepare(undefined, otherId);
  await view.user.click(
    screen.getByRole("button", { name: "Enviar a cocina" }),
  );
  const signal = transport.mock.calls[0][1]?.signal;
  view.unmount();
  await act(async () => pending.resolve(success("create")));
  expect({ aborted: signal?.aborted, navigation: push.mock.calls }).toEqual({
    aborted: true,
    navigation: [],
  });
});
it("AUDIT: submission must bind expected staff principal", async () => {
  transport.mockResolvedValue(success("create"));
  const view = await prepare(undefined, otherId);
  await view.user.click(
    screen.getByRole("button", { name: "Enviar a cocina" }),
  );
  expect(
    new Headers(transport.mock.calls[0][1]?.headers).get(
      "X-Wok-Expected-Principal",
    ),
  ).toBe(otherId);
});
it("AUDIT: user changes during response must not navigate new user", async () => {
  const pending = deferred();
  transport.mockReturnValueOnce(pending.promise);
  const view = await prepare(undefined, otherId);
  await view.user.click(
    screen.getByRole("button", { name: "Enviar a cocina" }),
  );
  view.rerender(
    <OperationalOrderBuilder accountId={accountId} userId={accountId} />,
  );
  await act(async () => pending.resolve(success("create")));
  expect(push).not.toHaveBeenCalled();
});

it("un formulario antiguo sin propietario no env?a silenciosamente", async () => {
  render(<OperationalOrderBuilder accountId={accountId} />);
  expect(
    screen.getByRole("button", { name: "Enviar a cocina" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Enviar a cocina" }));
  expect(transport).not.toHaveBeenCalled();
});
it.each(modes)(
  "$mode: cambio externo antes de enviar no reasigna el intento",
  async ({ orderId: targetOrderId, label }) => {
    let owner = otherId;
    installPrivateSession(transport, () => owner);
    const view = await prepare(targetOrderId, otherId);
    owner = accountId;
    await view.user.click(screen.getByRole("button", { name: label }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: label })).toBeDisabled(),
    );
    expect(transport).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  },
);
it.each(modes)(
  "$mode: desmontaje conserva propietario, clave y contenido inciertos",
  async ({ mode, orderId: targetOrderId, label }) => {
    const pending = deferred();
    transport.mockReturnValueOnce(pending.promise);
    const view = await prepare(targetOrderId, otherId);
    await view.user.click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
    const saved = sessionStorage.getItem(
      `wok.order.attempt.v1:${otherId}:${accountId}:${targetOrderId ?? "new"}`,
    )!;
    view.unmount();
    await act(async () => pending.resolve(success(mode)));
    expect(
      sessionStorage.getItem(
        `wok.order.attempt.v1:${otherId}:${accountId}:${targetOrderId ?? "new"}`,
      ),
    ).toBe(saved);
    expect(JSON.parse(saved)).toMatchObject({
      ownerId: otherId,
      uncertain: true,
      confirmed: false,
    });
    expect(push).not.toHaveBeenCalled();
  },
);
