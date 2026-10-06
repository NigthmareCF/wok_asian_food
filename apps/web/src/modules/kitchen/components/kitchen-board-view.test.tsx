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
  testLoad,
  testOrder,
  testTicket,
} from "@/data/fixtures/operational-api-test";
import { KitchenBoardView } from "./kitchen-board-view";
import { OrderListView } from "@/modules/orders/components/order-list-view";
import type { KitchenTicket } from "../live-contract";
let ticket: KitchenTicket;
beforeEach(() => {
  ticket = { ...testTicket };
  vi.stubGlobal("crypto", { randomUUID: () => testId(40) });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options) => {
      const path = String(url);
      if (options?.method === "POST") {
        ticket = { ...ticket, status: "PREPARING", rowVersion: 2 };
        return Response.json(ticket);
      }
      if (options?.method === "PATCH") {
        ticket = { ...ticket, status: "READY", rowVersion: 3 };
        return Response.json(ticket);
      }
      if (path.includes("/load")) return Response.json([testLoad]);
      if (path.includes("status=OPEN"))
        return Response.json(ticket.status === "READY" ? [] : [ticket]);
      if (path.includes("status=READY"))
        return Response.json(ticket.status === "READY" ? [ticket] : []);
      if (path.endsWith("/" + testOrder.id)) return Response.json(testDetails);
      if (path === "/bff/operational/orders")
        return Response.json([
          {
            ...testOrder,
            status: ticket.status === "READY" ? "READY" : "SENT",
          },
        ]);
      throw Error("Unexpected request " + path);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("claims, prepares and completes a ticket; READY remains visible in kitchen and orders", async () => {
  const user = userEvent.setup();
  const view = render(<KitchenBoardView />);
  await user.click(
    await screen.findByRole("button", { name: "Tomar comanda" }),
  );
  await user.click(await screen.findByRole("button", { name: "Marcar listo" }));
  expect(await screen.findByText("Listo")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Tomar comanda" }),
  ).not.toBeInTheDocument();
  const calls = vi.mocked(fetch).mock.calls;
  expect(calls.find((c) => c[1]?.method === "POST")?.[0]).toBe(
    "/bff/operational/kitchen/tickets/" + testTicket.id + "/claim",
  );
  expect(
    JSON.parse(String(calls.find((c) => c[1]?.method === "PATCH")?.[1]?.body)),
  ).toEqual({ status: "READY", expectedVersion: 2 });
  view.unmount();
  render(<OrderListView />);
  expect(await screen.findByText("Listo")).toBeInTheDocument();
});
it("maps products to their real station and disables unsupported actions", async () => {
  const user = userEvent.setup();
  render(<KitchenBoardView />);
  await user.click(
    await screen.findByRole("button", { name: "Ver productos" }),
  );
  expect(await screen.findByText(/2 × Arroz de prueba/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cambiar ETA" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Editar líneas" })).toBeDisabled();
});
it("refreshes competing claims after 409", async () => {
  const original = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (url, options) => {
    if (options?.method === "POST") {
      ticket = { ...ticket, status: "PREPARING", rowVersion: 2 };
      return Response.json({}, { status: 409 });
    }
    return original(url, options);
  });
  const user = userEvent.setup();
  render(<KitchenBoardView />);
  await user.click(
    await screen.findByRole("button", { name: "Tomar comanda" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("409");
  expect(
    await screen.findByRole("button", { name: "Marcar listo" }),
  ).toBeEnabled();
});
it("blocks duplicate claims during an unresolved request", async () => {
  let finish!: (r: Response) => void;
  const original = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (url, options) =>
    options?.method === "POST"
      ? new Promise((r) => {
          finish = r;
        })
      : original(url, options),
  );
  render(<KitchenBoardView />);
  const button = await screen.findByRole("button", { name: "Tomar comanda" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(
    vi.mocked(fetch).mock.calls.filter((c) => c[1]?.method === "POST"),
  ).toHaveLength(1);
  expect(button).toBeDisabled();
  finish(Response.json(testTicket));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Tomar comanda" })).toBeEnabled(),
  );
});
it("does not permit actions when READY queue fails", async () => {
  const original = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (url, options) =>
    String(url).includes("status=READY")
      ? Response.json({}, { status: 503 })
      : original(url, options),
  );
  render(<KitchenBoardView />);
  await screen.findByRole("alert");
  expect(
    await screen.findByRole("button", { name: "Tomar comanda" }),
  ).toBeDisabled();
});
