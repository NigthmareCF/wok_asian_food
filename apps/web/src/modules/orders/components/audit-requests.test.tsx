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
});
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
  const fetcher = vi
    .fn()
    .mockReturnValueOnce(old)
    .mockResolvedValue(Response.json([row("new-filter")]));
  installPrivateSession(fetcher);
  render(<OperationalOrderRequestsView />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Todas" }));
  await screen.findAllByText("new-filter");
  await act(async () => resolve(Response.json([row("old-filter")])));
  expect(screen.queryAllByText("old-filter")).toHaveLength(0);
});
