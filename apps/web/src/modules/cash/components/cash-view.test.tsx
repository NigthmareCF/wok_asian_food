import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FinancialAttemptProvider } from "@/modules/payments/financial-attempt-provider";
import { CashView } from "./cash-view";
const id = "20000000-0000-4000-8000-000000000001",
  user = "10000000-0000-4000-8000-000000000001";
const initial = {
  id,
  registerCode: "MAIN",
  currency: "GTQ",
  status: "OPEN",
  rowVersion: 1,
  expectedCash: 100,
  breakdown: {
    opening: 100,
    sales: 0,
    tips: 0,
    otherIncome: 0,
    expenses: 0,
    withdrawals: 0,
    expectedCash: 100,
  },
  movements: [],
};
let session = structuredClone(initial),
  absent = false,
  posts: { url: string; body: Record<string, unknown> }[];
beforeEach(() => {
  session = structuredClone(initial);
  absent = false;
  posts = [];
  sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/bff/auth/session")
        return Response.json({
          user: { userId: user, permissions: ["cash:manage"] },
        });
      if (init?.method === "POST") {
        const p = JSON.parse(String(init.body));
        posts.push({ url, body: p });
        absent = false;
        if (url === "/bff/operational/cash-sessions") {
          session = {
            ...structuredClone(initial),
            id: crypto.randomUUID(),
            expectedCash: p.openingFloat,
            breakdown: {
              ...initial.breakdown,
              opening: p.openingFloat,
              expectedCash: p.openingFloat,
            },
          };
        }
        if (url.endsWith("/close")) {
          session.status = "CLOSED";
          session.rowVersion++;
        }
        return Response.json({
          ...session,
          ...(session.status === "CLOSED"
            ? { countedCash: p.countedCash, difference: 0 }
            : {}),
        });
      }
      return absent
        ? Response.json({ message: "No hay turno" }, { status: 404 })
        : Response.json(session);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const show = (permissions = ["cash:manage"]) =>
  render(
    <FinancialAttemptProvider userId={user} permissions={permissions}>
      <CashView />
    </FinancialAttemptProvider>,
  );
it("opens a real turn after checking the current cash permission", async () => {
  absent = true;
  const u = userEvent.setup();
  show();
  await screen.findByLabelText("Fondo inicial");
  await u.type(screen.getByLabelText("Fondo inicial"), "100");
  await u.click(screen.getByRole("button", { name: "Confirmar apertura" }));
  await screen.findByRole("button", { name: "Iniciar conteo de cierre" });
  expect(posts[0].body).toEqual({ registerCode: "MAIN", openingFloat: 100 });
});
it("retains an obsolete count, blocks close and requires explicit review and recount", async () => {
  const u = userEvent.setup();
  show();
  await screen.findByRole("button", { name: "Iniciar conteo de cierre" });
  await u.click(
    screen.getByRole("button", { name: "Iniciar conteo de cierre" }),
  );
  await u.type(screen.getByLabelText("Efectivo contado"), "100");
  session.rowVersion = 2;
  session.expectedCash = 130;
  session.breakdown.sales = 30;
  session.breakdown.expectedCash = 130;
  await u.click(screen.getByRole("button", { name: "Actualizar caja" }));
  await screen.findByText("La caja cambió. Debes revisar y recontar.");
  expect(screen.getByLabelText("Efectivo contado")).toHaveValue("100");
  expect(
    screen.getByRole("button", { name: "Confirmar cierre" }),
  ).toBeDisabled();
  expect(posts).toHaveLength(0);
  await u.click(
    screen.getByRole("button", { name: "Revisar e iniciar un nuevo conteo" }),
  );
  expect(screen.getByLabelText("Efectivo contado")).toHaveValue("");
  await u.type(screen.getByLabelText("Efectivo contado"), "130");
  await u.click(screen.getByRole("button", { name: "Confirmar cierre" }));
  await waitFor(() => expect(posts).toHaveLength(1));
  expect(posts[0].body).toEqual({ countedCash: 130, expectedVersion: 2 });
  await screen.findByText("Cierre confirmado por el servidor.");
});
it("does not expose a close action without cash manage", async () => {
  show(["accounts:manage"]);
  await screen.findByText(/No tienes permiso para administrar caja/);
  expect(
    screen.queryByRole("button", { name: "Iniciar conteo de cierre" }),
  ).not.toBeInTheDocument();
});

// Regresión de la reproducción independiente H02: versiones iguales en turnos distintos.
it("requires a fresh count for another operator's new turn A/v1 to B/v1", async () => {
  const u = userEvent.setup();
  show();
  await u.click(
    await screen.findByRole("button", { name: "Iniciar conteo de cierre" }),
  );
  await u.type(screen.getByLabelText("Efectivo contado"), "100");
  await u.click(screen.getByRole("button", { name: "Confirmar cierre" }));
  await screen.findByRole("button", { name: "Consultar nuevo turno" });
  session = {
    ...structuredClone(initial),
    id: "30000000-0000-4000-8000-000000000001",
    expectedCash: 200,
    breakdown: { ...initial.breakdown, opening: 200, expectedCash: 200 },
  };
  await u.click(screen.getByRole("button", { name: "Consultar nuevo turno" }));
  await u.click(
    await screen.findByRole("button", { name: "Iniciar conteo de cierre" }),
  );
  expect(screen.getByLabelText("Efectivo contado")).toHaveValue("");
  expect(
    screen.getByRole("button", { name: "Confirmar cierre" }),
  ).toBeDisabled();
  expect(posts).toHaveLength(1);
  await u.type(screen.getByLabelText("Efectivo contado"), "200");
  await u.click(screen.getByRole("button", { name: "Confirmar cierre" }));
  await waitFor(() => expect(posts).toHaveLength(2));
  expect(posts[1]).toEqual({
    url: "/bff/operational/cash-sessions/30000000-0000-4000-8000-000000000001/close",
    body: { countedCash: 200, expectedVersion: 1 },
  });
});
it("requires a new count after closing and opening another turn in the same view", async () => {
  const u = userEvent.setup();
  show();
  await u.click(
    await screen.findByRole("button", { name: "Iniciar conteo de cierre" }),
  );
  await u.type(screen.getByLabelText("Efectivo contado"), "100");
  await u.click(screen.getByRole("button", { name: "Confirmar cierre" }));
  await screen.findByRole("button", { name: "Consultar nuevo turno" });
  absent = true;
  await u.click(screen.getByRole("button", { name: "Consultar nuevo turno" }));
  await u.type(await screen.findByLabelText("Fondo inicial"), "200");
  await u.click(screen.getByRole("button", { name: "Confirmar apertura" }));
  await u.click(
    await screen.findByRole("button", { name: "Iniciar conteo de cierre" }),
  );
  expect(screen.getByLabelText("Efectivo contado")).toHaveValue("");
  expect(
    screen.getByRole("button", { name: "Confirmar cierre" }),
  ).toBeDisabled();
});
it("blocks a count when another operator closes the same turn", async () => {
  const u = userEvent.setup();
  show();
  await u.click(
    await screen.findByRole("button", { name: "Iniciar conteo de cierre" }),
  );
  await u.type(screen.getByLabelText("Efectivo contado"), "100");
  session.status = "CLOSED";
  session.rowVersion++;
  await u.click(screen.getByRole("button", { name: "Actualizar caja" }));
  await screen.findByText("La caja cambió. Debes revisar y recontar.");
  expect(screen.getByLabelText("Efectivo contado")).toHaveValue("100");
  expect(
    screen.getByRole("button", { name: "Confirmar cierre" }),
  ).toBeDisabled();
  expect(posts).toHaveLength(0);
});
