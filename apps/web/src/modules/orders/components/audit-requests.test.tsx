import { installPrivateSession } from "@/test/private-session-fixture";
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { it, expect, vi, afterEach } from "vitest";
import { OperationalOrderRequestsView } from "./operational-order-requests-view";
import { formatServiceDateTime } from "@/modules/checkout/service-time";
const row = (name: string) => ({
  requestId: "30000000-0000-4000-8000-000000000001",
  status: "PENDING_REVIEW",
  fulfillmentType: "PICKUP",
  requestedFor: "2026-10-08T20:00:00Z",
  submittedAt: "2026-10-08T18:00:00Z",
  customerName: name,
  customerEmail: "fictitious@wok.test",
  subtotal: 68,
  currency: "GTQ",
  items: [{ name: "Gyozas", quantity: 1, unitPrice: 68, lineTotal: 68 }],
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it.each(["America/Guatemala", "UTC", "Asia/Tokyo"])(
  "F1/F3: reception shows delivery contact and Guatemala appointments on a %s device",
  async (zone) => {
    vi.stubEnv("TZ", zone);
    const delivery = {
      ...row("Delivery privado"),
      fulfillmentType: "DELIVERY",
      requestedFor: "2026-10-10T00:15:00Z",
      submittedAt: "2026-10-09T23:15:00Z",
      deliveryAddress: "Dirección ficticia de recepción",
      deliveryReference: "Portón azul",
      contactPhone: "+50255550101",
      paymentPreference: "CASH_ON_DELIVERY",
    };
    installPrivateSession(
      vi.fn((input) =>
        Promise.resolve(
          Response.json(
            String(input).includes("order-change-requests") ? [] : [delivery],
          ),
        ),
      ),
    );
    render(<OperationalOrderRequestsView />);
    expect(
      await screen.findByText(delivery.deliveryAddress),
    ).toBeInTheDocument();
    expect(screen.getByText(delivery.deliveryReference)).toBeInTheDocument();
    expect(screen.getByText(delivery.contactPhone)).toBeInTheDocument();
    expect(screen.getByText("Efectivo al recibir")).toBeInTheDocument();
    expect(
      screen.getAllByText(formatServiceDateTime(delivery.requestedFor)),
    ).toHaveLength(2);
    expect(
      screen.getByText(formatServiceDateTime(delivery.submittedAt)),
    ).toBeInTheDocument();
    expect(formatServiceDateTime(delivery.requestedFor)).toMatch(/18:15|6:15/);
    expect(screen.getByText("Horario solicitado")).toBeInTheDocument();
  },
);
it("AUDIT: requests fetch aborts on unmount", async () => {
  let signal: AbortSignal | undefined;
  installPrivateSession(
    vi.fn((_u, init) => {
      signal = init.signal;
      return new Promise<Response>(() => {});
    }),
  );
  const view = render(<OperationalOrderRequestsView />);
  await waitFor(() => expect(signal).toBeDefined());
  view.unmount();
  expect(signal?.aborted).toBe(true);
});
it("AUDIT: late old-filter response must not overwrite new filter", async () => {
  let resolve!: (r: Response) => void;
  const old = new Promise<Response>((r) => (resolve = r));
  let requestCalls = 0;
  const fetcher = vi.fn((input) => {
    if (String(input).includes("order-change-requests"))
      return Promise.resolve(Response.json([]));
    requestCalls++;
    return requestCalls === 1
      ? old
      : Promise.resolve(Response.json([row("new-filter")]));
  });
  installPrivateSession(fetcher);
  render(<OperationalOrderRequestsView />);
  await waitFor(() => expect(requestCalls).toBe(1));
  fireEvent.click(screen.getByRole("button", { name: "Todas" }));
  await screen.findAllByText("new-filter");
  await act(async () => resolve(Response.json([row("old-filter")])));
  expect(screen.queryAllByText("old-filter")).toHaveLength(0);
});
