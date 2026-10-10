import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FinancialAttemptProvider } from "../financial-attempt-provider";
import { PaymentsListView } from "./payments-list-view";
import { PaymentDetailView } from "./payment-detail-view";
import { PreBillView } from "./prebill-view";
import type { DurableAttempt } from "../attempt-contract";
const account = "20000000-0000-4000-8000-000000000001",
  user = "10000000-0000-4000-8000-000000000001",
  id = "30000000-0000-4000-8000-000000000001",
  successor = "40000000-0000-4000-8000-000000000001",
  date = "2026-10-06T18:00:00Z",
  permissions = ["payments:manage", "payments:resolve", "accounts:manage"];
const initial = {
  account: {
    id: account,
    name: "Cuenta parcial real",
    status: "IN_COBRO",
    diningTableId: account,
    diningTableName: "Mesa real",
    rowVersion: 2,
  },
  total: 100,
  paid: 20,
  balance: 80,
  tips: 0,
  currencies: ["GTQ"],
  currencyTotals: [
    { currency: "GTQ", total: 100, paid: 20, balance: 80, tips: 0 },
  ],
  pendingOrderCount: 0,
  unfinalizedOrderCount: 1,
  orders: [
    {
      id: account,
      code: "Real-1",
      status: "SERVED",
      channel: "DINE_IN",
      total: 100,
      subtotal: 100,
      discount: 0,
      currency: "GTQ",
      rowVersion: 2,
      items: [
        {
          id: account,
          name: "Precio congelado",
          quantity: 2,
          unitPrice: 50,
          lineTotal: 100,
        },
      ],
    },
  ],
  payments: [],
};
let details = structuredClone(initial),
  rows: DurableAttempt[],
  posts: string[],
  reject: boolean,
  owner: string;
const make = (): DurableAttempt => ({
  attemptId: id,
  accountId: account,
  version: 1,
  status: "PREPARED",
  amount: 30,
  tipAmount: 0,
  currency: "GTQ",
  method: "TRANSFER",
  registerCode: "MAIN",
  availableActions: ["CAPTURE", "RETIRE"],
});
beforeEach(() => {
  history.replaceState(null, "", "/");
  sessionStorage.clear();
  details = structuredClone(initial);
  rows = [];
  posts = [];
  reject = false;
  owner = user;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/bff/auth/session")
        return Response.json({ user: { userId: user, permissions } });
      const review = () => ({
        ownerUserId: owner,
        attempt: rows[0],
        registeredCapture: false,
        claimState: "ABSENT",
        availableActions:
          owner !== user && rows[0]?.status === "PENDING"
            ? ["RETIRE_WITH_EVIDENCE"]
            : [],
      });
      if (init?.method === "POST") {
        posts.push(url);
        const body = JSON.parse(String(init.body));
        if (url.endsWith("/capture")) {
          if (reject) {
            rows[0] = {
              ...rows[0],
              status: "REJECTED",
              version: 3,
              executionRequestedAt: date,
              rejectionStatus: 409,
              rejectionMessage: "Caja cerrada",
              availableActions: ["REPLACE"],
            };
          } else {
            const r = rows[0];
            details.paid += r.amount;
            details.balance -= r.amount;
            details.currencyTotals[0] = {
              ...details.currencyTotals[0],
              paid: details.paid,
              balance: details.balance,
            };
            rows[0] = {
              ...r,
              status: "CONFIRMED",
              version: 3,
              executionRequestedAt: date,
              availableActions: [],
              confirmation: {
                paymentId: r.attemptId,
                amount: r.amount,
                tipAmount: r.tipAmount,
                currency: r.currency,
                method: r.method,
                capturedAt: date,
              },
              receiptAvailability: "AVAILABLE",
              balance: details.balance,
            };
          }
        } else if (url.endsWith("/resolution")) {
          rows[0] = {
            ...rows[0],
            status: "RETIRED",
            version: 3,
            availableActions: [],
            resolution: {
              actorId: user,
              resolvedAt: date,
              expectedVersion: 2,
              physicalReceiptStatus: "NOT_RECEIVED",
              reason: body.reason,
              evidenceSummary: body.evidenceSummary,
            },
          };
          return Response.json(review());
        } else {
          const payload = url.endsWith("/replacement") ? body.payment : body;
          rows.unshift({
            ...make(),
            ...payload,
            attemptId: rows.length ? successor : id,
            previousAttemptId: payload.expectedPreviousAttemptId,
          });
          delete (rows[0] as unknown as Record<string, unknown>)
            .expectedPreviousAttemptId;
        }
        return Response.json(rows[0]);
      }
      if (url === "/bff/operational/accounts")
        return Response.json([
          details,
          {
            ...details,
            account: {
              ...details.account,
              id: user,
              name: "Pagada pendiente",
              status: "PAID",
            },
            paid: 100,
            balance: 0,
            currencyTotals: [
              { currency: "GTQ", total: 100, paid: 100, balance: 0, tips: 0 },
            ],
          },
        ]);
      if (url.endsWith("/context")) {
        const active = rows.find((r) =>
          ["PREPARED", "PENDING"].includes(r.status),
        );
        return Response.json({
          accountId: account,
          canPrepare:
            !active && details.balance > 0 && rows[0]?.status !== "REJECTED",
          expectedPreviousAttemptId: !active ? rows[0]?.attemptId : null,
          ownActiveAttempt: owner === user ? active : null,
          blockedByAnotherOperator: owner !== user && !!active,
        });
      }
      if (url.endsWith("/resolution")) return Response.json(review());
      if (url.includes("payment-attempt-resolutions"))
        return Response.json({
          items: rows
            .filter((r) => ["PREPARED", "PENDING"].includes(r.status))
            .map((r) => ({
              attemptId: r.attemptId,
              accountId: account,
              ownerUserId: owner,
              status: r.status,
              version: r.version,
              createdAt: date,
            })),
        });
      if (url.includes("/payment-attempts/")) return Response.json(rows[0]);
      if (url.includes("/payment-attempts"))
        return Response.json({
          items: owner === user ? rows : [],
          blockedByAnotherOperator: owner !== user,
        });
      return Response.json(details);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const show = (view: React.ReactNode, p = permissions) =>
  render(
    <FinancialAttemptProvider userId={user} permissions={p}>
      {view}
    </FinancialAttemptProvider>,
  );
async function prepare(u: ReturnType<typeof userEvent.setup>, amount: string) {
  await screen.findByRole("heading", { name: "Preparar cobro" });
  await waitFor(() =>
    expect(
      screen.getByRole("group", { name: "Importes del pago" }),
    ).not.toBeDisabled(),
  );
  await u.selectOptions(screen.getByLabelText("Método"), "TRANSFER");
  await u.clear(screen.getByLabelText("Importe"));
  await u.type(screen.getByLabelText("Importe"), amount);
  await u.click(screen.getByRole("button", { name: "Preparar importe" }));
  await screen.findByRole("button", { name: "Revisar captura" });
}
async function capture(u: ReturnType<typeof userEvent.setup>) {
  await u.click(screen.getByRole("button", { name: "Revisar captura" }));
  await u.click(
    screen.getByRole("button", { name: "Confirmar registro de pago" }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
}
it("keeps complete account list and adds separately authorized durable history", async () => {
  show(<PaymentsListView />);
  expect(await screen.findByText(/Cuenta parcial real/)).toBeInTheDocument();
  expect(screen.getByText(/Pagada pendiente/)).toBeInTheDocument();
  expect(
    await screen.findByRole("heading", { name: "Mis intentos" }),
  ).toBeInTheDocument();
  expect(posts).toHaveLength(0);
});
it("partial then complete flow separates preparation from capture and never finalizes/releases", async () => {
  const u = userEvent.setup();
  show(<PaymentDetailView recordId={account} />);
  await prepare(u, "30");
  expect(posts).toHaveLength(1);
  expect(details.balance).toBe(80);
  await capture(u);
  await waitFor(() => expect(details.balance).toBe(50));
  await prepare(u, "50");
  expect(posts).toHaveLength(3);
  await capture(u);
  await waitFor(() => expect(details.balance).toBe(0));
  expect(posts).toHaveLength(4);
  expect(
    posts.every(
      (p) =>
        !p.endsWith("/close") &&
        !p.endsWith("/status") &&
        !p.endsWith("/payments"),
    ),
  ).toBe(true);
});
it("shows frozen server amount before confirmation and never treats preparation as payment", async () => {
  const u = userEvent.setup();
  show(<PaymentDetailView recordId={account} />);
  await prepare(u, "30");
  expect(details.balance).toBe(80);
  expect(
    screen.queryByText("Pago confirmado por el servidor."),
  ).not.toBeInTheDocument();
  await u.click(screen.getByRole("button", { name: "Revisar captura" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("Importe congelado");
  expect(screen.getByRole("dialog")).toHaveTextContent(id);
  expect(posts).toHaveLength(1);
});
it("traps keyboard focus, supports Escape and restores the triggering control", async () => {
  const u = userEvent.setup();
  show(<PaymentDetailView recordId={account} />);
  await prepare(u, "30");
  const trigger = screen.getByRole("button", { name: "Revisar captura" });
  await u.click(trigger);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus(),
  );
  await u.tab({ shift: true });
  expect(
    screen.getByRole("button", { name: "Confirmar registro de pago" }),
  ).toHaveFocus();
  await u.tab();
  expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus();
  await u.keyboard("{Escape}");
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(posts).toHaveLength(1);
});
it("durable rejection offers correction without automatic capture or invented success", async () => {
  reject = true;
  const u = userEvent.setup();
  show(<PaymentDetailView recordId={account} />);
  await prepare(u, "30");
  await capture(u);
  await screen.findByRole("heading", {
    name: "Corregir rechazo mediante reemplazo",
  });
  expect(
    screen.queryByText("Pago confirmado por el servidor."),
  ).not.toBeInTheDocument();
  await u.type(
    screen.getByLabelText("Motivo del reemplazo"),
    "Transferencia revisada",
  );
  await u.clear(screen.getByLabelText("Importe"));
  await u.type(screen.getByLabelText("Importe"), "20");
  await u.click(
    screen.getByRole("button", { name: "Preparar reemplazo vinculado" }),
  );
  await screen.findByRole("button", { name: "Revisar captura" });
  expect(posts).toHaveLength(3);
  expect(details.balance).toBe(80);
});
it("keeps frozen-price prebill and no orders-manage dependency", async () => {
  show(<PreBillView recordId={account} />, ["payments:manage"]);
  expect(await screen.findByText(/Precio congelado/)).toBeInTheDocument();
  expect(
    vi
      .mocked(fetch)
      .mock.calls.some(([url]) => String(url).includes("/orders/")),
  ).toBe(false);
});
it("account reader sees no cashier controls and unserved orders remain disabled", async () => {
  show(<PaymentDetailView recordId={account} />, ["accounts:manage"]);
  await screen.findByText(/No tienes permiso para registrar cobros/);
  expect(
    screen.queryByRole("button", { name: "Preparar importe" }),
  ).not.toBeInTheDocument();
  cleanup();
  details.pendingOrderCount = 1;
  show(<PaymentDetailView recordId={account} />);
  await screen.findByRole("heading", { name: "Preparar cobro" });
  expect(
    screen.getByRole("group", { name: "Importes del pago" }),
  ).toBeDisabled();
});
it("unknown/received physical money never offers withdrawal and NOT_RECEIVED requires evidence", async () => {
  history.replaceState(null, "", "/?reviewAttempt=" + id);
  owner = successor;
  rows = [
    {
      ...make(),
      status: "PENDING",
      version: 2,
      executionRequestedAt: date,
      availableActions: ["CONTINUE_SAME_ATTEMPT"],
    },
  ];
  const u = userEvent.setup();
  show(<PaymentDetailView recordId={account} />);
  await screen.findByLabelText("Situación del dinero físico");
  expect(
    screen.queryByRole("button", { name: "Revisar resolución sin captura" }),
  ).not.toBeInTheDocument();
  await u.selectOptions(
    screen.getByLabelText("Situación del dinero físico"),
    "RECEIVED",
  );
  expect(
    screen.queryByRole("button", { name: "Revisar resolución sin captura" }),
  ).not.toBeInTheDocument();
  await u.selectOptions(
    screen.getByLabelText("Situación del dinero físico"),
    "NOT_RECEIVED",
  );
  expect(
    screen.getByRole("button", { name: "Revisar resolución sin captura" }),
  ).toBeDisabled();
  await u.type(
    screen.getByLabelText("Motivo de resolución"),
    "No se recibió dinero",
  );
  await u.type(
    screen.getByLabelText("Evidencia comprobada"),
    "Caja y comprobante ficticios revisados",
  );
  await u.click(
    screen.getByRole("button", { name: "Revisar resolución sin captura" }),
  );
  expect(screen.getByRole("dialog")).toHaveTextContent("hechos distintos");
});
it("exceptional retirement preserves debt and shows original marker/evidence", async () => {
  history.replaceState(null, "", "/?reviewAttempt=" + id);
  owner = successor;
  rows = [
    {
      ...make(),
      status: "PENDING",
      version: 2,
      executionRequestedAt: date,
      availableActions: ["CONTINUE_SAME_ATTEMPT"],
    },
  ];
  const u = userEvent.setup();
  show(<PaymentDetailView recordId={account} />);
  await screen.findByLabelText("Situación del dinero físico");
  await u.selectOptions(
    screen.getByLabelText("Situación del dinero físico"),
    "NOT_RECEIVED",
  );
  await u.type(screen.getByLabelText("Motivo de resolución"), "No recibido");
  await u.type(
    screen.getByLabelText("Evidencia comprobada"),
    "Revisión ficticia",
  );
  await u.click(
    screen.getByRole("button", { name: "Revisar resolución sin captura" }),
  );
  await u.click(
    screen.getByRole("button", { name: "Confirmar retiro sin captura" }),
  );
  await waitFor(() => expect(rows[0].status).toBe("RETIRED"));
  expect(details.balance).toBe(80);
  expect(rows[0].executionRequestedAt).toBe(date);
  expect(posts).toHaveLength(1);
});
it("creator with both permissions cannot resolve his own attempt", async () => {
  history.replaceState(null, "", "/?reviewAttempt=" + id);
  rows = [
    {
      ...make(),
      status: "PENDING",
      version: 2,
      executionRequestedAt: date,
      availableActions: ["CONTINUE_SAME_ATTEMPT"],
    },
  ];
  show(<PaymentDetailView recordId={account} />);
  await screen.findByText(/Otro responsable autorizado debe resolver/);
  expect(
    screen.queryByLabelText("Situación del dinero físico"),
  ).not.toBeInTheDocument();
  expect(posts).toHaveLength(0);
});

it("ADMIN list provides local review links and no operator account or capture links", async () => {
  rows = [make()];
  owner = account;
  show(<PaymentsListView administrativeOnly />);
  const link = await screen.findByRole("link", {
    name: "Revisar intento " + id,
  });
  expect(link).toHaveAttribute(
    "href",
    "/admin/payment-attempts/" + account + "?reviewAttempt=" + id,
  );
  expect(
    screen.queryByRole("heading", { name: "Mis intentos" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Precuenta" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Consultar cuenta" }),
  ).not.toBeInTheDocument();
  expect(posts).toHaveLength(0);
});
it("ADMIN detail stays exclusively exceptional even when lookup or query fails", async () => {
  rows = [make()];
  history.replaceState(null, "", "/admin/payment-attempts/" + account);
  show(<PaymentDetailView recordId={account} administrativeAttemptId={id} />);
  await screen.findByRole("alert");
  expect(
    screen.queryByRole("heading", { name: "Preparar cobro" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Revisar captura" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Mis intentos" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Volver a cuentas" }),
  ).toHaveAttribute("href", "/admin/payment-attempts");
  expect(posts).toHaveLength(0);
});
it("ADMIN detail with valid pinned destination presents review without any operator controls", async () => {
  rows = [
    {
      ...make(),
      status: "PENDING",
      version: 2,
      executionRequestedAt: date,
      availableActions: ["CONTINUE_SAME_ATTEMPT"],
    },
  ];
  owner = account;
  history.replaceState(
    null,
    "",
    "/admin/payment-attempts/" + account + "?reviewAttempt=" + id,
  );
  show(<PaymentDetailView recordId={account} administrativeAttemptId={id} />);
  await screen.findByLabelText("Situación del dinero físico");
  expect(
    screen.queryByRole("button", { name: /captura|preparación|reemplazo/i }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Consumos" }),
  ).not.toBeInTheDocument();
  expect(posts).toHaveLength(0);
});
