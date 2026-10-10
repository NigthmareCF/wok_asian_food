import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DeliveryCheckout } from "./delivery-checkout";

const fixture = vi.hoisted(() => ({
  userId: "11111111-1111-4111-8111-111111111111",
  productId: "22222222-2222-4222-8222-222222222222",
  addressId: "33333333-3333-4333-8333-333333333333",
  complete: vi.fn(),
}));

vi.mock("@/modules/clients/use-client-identity", () => ({
  useClientIdentity: () => ({
    identity: { status: "verified", ownerId: fixture.userId, generation: 1 },
    verified: true,
    refresh: vi.fn(),
  }),
}));
vi.mock("@/modules/clients/client-identity-store", () => ({
  createClientOperation: () => ({
    confirm: async () => true,
    valid: () => true,
    dispose: vi.fn(),
    signal: new AbortController().signal,
  }),
}));
vi.mock("@/modules/cart/live-cart-provider", () => ({
  useLiveCart: () => ({
    items: [
      {
        productId: fixture.productId,
        name: "Ramen",
        quantity: 1,
      },
    ],
    complete: fixture.complete,
  }),
}));
vi.mock("@/modules/menu/use-public-menu", () => ({
  usePublicMenu: () => ({
    menu: {
      categories: [
        {
          items: [
            {
              id: fixture.productId,
              name: "Ramen",
              price: 10,
              currency: "GTQ",
              estimatedPreparationSeconds: 60,
            },
          ],
        },
      ],
    },
    error: null,
    reload: vi.fn(),
  }),
}));
vi.mock("@/modules/client-order-tracking/use-client-pickup-resource", () => ({
  useClientPickupResource: () => ({
    data: [
      {
        addressId: fixture.addressId,
        label: "Casa guardada",
        address: "Zona 10, Ciudad de Guatemala",
        reference: null,
        contactPhone: "+502 5555 5555",
        isDefault: true,
        version: 2,
      },
    ],
    error: null,
    reload: vi.fn(),
  }),
}));

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
    Response.json({
      requestId: "44444444-4444-4444-8444-444444444444",
      status: "PENDING_REVIEW",
      requestedFor: new Date(Date.now() + 3_600_000).toISOString(),
      subtotal: 10,
      currency: "GTQ",
      idempotentReplay: false,
      fulfillmentType: "DELIVERY",
      paymentPreference: "CASH_ON_DELIVERY",
      message: "Solicitud recibida",
    }),
  ));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("preserves the manual draft and sends no addressId with the expected identity", async () => {
  const user = userEvent.setup();
  render(<DeliveryCheckout userId={fixture.userId} />);
  await screen.findByText(/Subtotal estimado/);
  const address = screen.getByLabelText("Dirección de entrega");
  const reference = screen.getByLabelText("Referencia (opcional)");
  const phone = screen.getByLabelText("Teléfono de contacto");
  expect(address).toHaveValue("");
  await user.type(address, "Dirección manual editada");
  await user.type(reference, "Referencia manual");
  await user.type(phone, "+502 5555 5555");
  expect(address).toHaveValue("Dirección manual editada");
  await user.click(screen.getByRole("button", { name: "Enviar solicitud de delivery" }));
  await screen.findByText("Solicitud registrada");
  const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
  const body = JSON.parse(String(options.body)) as Record<string, unknown>;
  expect(body).toEqual(expect.objectContaining({
    address: "Dirección manual editada",
    reference: "Referencia manual",
    contactPhone: "+502 5555 5555",
  }));
  expect(body).not.toHaveProperty("addressId");
  expect(new Headers(options.headers).get("X-Wok-Expected-Principal")).toBe(fixture.userId);
});
