import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  installPrivateSession,
  staffFixtureId,
} from "@/test/private-session-fixture";
import { clientIdentityStore } from "@/modules/clients/client-identity-store";
import {
  ClientDeliveryDetail,
  ClientDeliveryHistory,
} from "./client-delivery-history";
const receipt = {
  requestId: "30000000-0000-4000-8000-000000000001",
  fulfillmentType: "DELIVERY",
  status: "ACCEPTED",
  requestedFor: "2026-10-09T20:25:00Z",
  subtotal: 25.1,
  currency: "GTQ",
  paymentPreference: "CASH_ON_DELIVERY",
  orderId: "30000000-0000-4000-8000-000000000002",
  orderStatus: "READY",
  message: "",
  idempotentReplay: false,
};
afterEach(() => {
  cleanup();
  clientIdentityStore.invalidate();
  vi.unstubAllGlobals();
});
it("shows the linked preparation status without presenting delivery as pickup", async () => {
  installPrivateSession(vi.fn(() => Promise.resolve(Response.json([receipt]))));
  render(<ClientDeliveryHistory userId={staffFixtureId} />);
  expect(await screen.findByText(/Listo en cocina/)).toBeInTheDocument();
  expect(screen.queryByText(/Listo para recoger/)).not.toBeInTheDocument();
});
it("replaces the pending message after operational acceptance and refresh", async () => {
  let accepted = false;
  installPrivateSession(
    vi.fn((url) => {
      if (String(url).includes("change-requests"))
        return Promise.resolve(Response.json(null));
      return Promise.resolve(
        Response.json({
          ...receipt,
          status: accepted ? "ACCEPTED" : "PENDING_REVIEW",
          orderId: accepted ? receipt.orderId : null,
          orderStatus: accepted ? "READY" : null,
          customerNote: null,
          items: [
            { name: "Wok", quantity: 1, unitPrice: 25.1, lineTotal: 25.1 },
          ],
        }),
      );
    }),
  );
  render(
    <ClientDeliveryDetail
      requestId={receipt.requestId}
      userId={staffFixtureId}
    />,
  );
  expect(
    await screen.findByText(/El restaurante debe revisar tu solicitud/),
  ).toBeInTheDocument();
  accepted = true;
  fireEvent.click(screen.getByRole("button", { name: "Actualizar estado" }));
  expect(
    await screen.findByText(/El restaurante aceptó tu solicitud/),
  ).toBeInTheDocument();
  expect(
    screen.queryByText(/El restaurante debe revisar tu solicitud/),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Cancelar solicitud" }),
  ).not.toBeInTheDocument();
});
