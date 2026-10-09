import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeliveryCheckout } from "./delivery-checkout";

const product = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Gyozas",
  price: 68,
  currency: "GTQ",
  estimatedPreparationSeconds: 300,
};
const menu = {
  asOf: "2026-10-08T12:00:00Z",
  categories: [{ id: "menu", name: "Platos", items: [product] }],
};
const addresses = [
  {
    addressId: "22222222-2222-4222-8222-222222222222",
    label: "Casa",
    address: "Zona 10, avenida 1 2-34",
    reference: "Portón negro",
    contactPhone: "+502 5555-0101",
    isDefault: true,
    version: 1,
  },
  {
    addressId: "33333333-3333-4333-8333-333333333333",
    label: "Trabajo",
    address: "Zona 4, calle 5 6-78",
    reference: null,
    contactPhone: "+502 5555-0102",
    isDefault: false,
    version: 2,
  },
];

vi.mock("@/modules/cart/live-cart-provider", () => ({
  useLiveCart: () => ({
    items: [{ productId: product.id, name: product.name, quantity: 1 }],
    complete: vi.fn(),
  }),
}));
vi.mock("@/modules/menu/use-public-menu", () => ({
  usePublicMenu: () => ({ menu, error: false, reload: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderCheckout() {
  return render(<DeliveryCheckout userId="delivery-address-test" />);
}

describe("DeliveryCheckout saved addresses", () => {
  it("preloads the default address without adding addressId to the fields", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(addresses));
    vi.stubGlobal("fetch", fetcher);
    renderCheckout();
    expect(
      await screen.findByDisplayValue(addresses[0].address),
    ).toBeInTheDocument();
    expect(
      screen.getByDisplayValue(addresses[0].reference!),
    ).toBeInTheDocument();
    expect(
      screen.getByDisplayValue(addresses[0].contactPhone),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Dirección guardada" }),
    ).toHaveValue(addresses[0].addressId);
  });

  it("copies a selected address and keeps fields when switching to manual mode", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(addresses));
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    renderCheckout();
    const selector = await screen.findByRole("combobox", {
      name: "Dirección guardada",
    });
    await user.selectOptions(selector, addresses[1].addressId);
    expect(screen.getByDisplayValue(addresses[1].address)).toBeInTheDocument();
    await user.selectOptions(selector, "");
    expect(screen.getByDisplayValue(addresses[1].address)).toBeInTheDocument();
    expect(
      screen.getByDisplayValue(addresses[1].contactPhone),
    ).toBeInTheDocument();
  });

  it("continues with manual entry when the address book fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const user = userEvent.setup();
    renderCheckout();
    const field = await screen.findByLabelText("Dirección de entrega");
    await user.type(field, "Zona 1, calle 2 3-45");
    expect(
      screen.getByText(/Puedes ingresar una dirección manualmente/),
    ).toBeInTheDocument();
    expect(field).toHaveValue("Zona 1, calle 2 3-45");
  });

  it("sends only textual delivery address fields in the payload", async () => {
    const receipt = {
      requestId: "44444444-4444-4444-8444-444444444444",
      status: "PENDING_REVIEW",
      requestedFor: "2099-12-10T18:00:00Z",
      subtotal: 68,
      currency: "GTQ",
      idempotentReplay: false,
      fulfillmentType: "DELIVERY",
      paymentPreference: "CASH_ON_DELIVERY",
      message: "received",
    };
    const fetcher = vi
      .fn()
      .mockImplementation((url: string) =>
        url === "/bff/client/addresses"
          ? Promise.resolve(Response.json(addresses))
          : Promise.resolve(Response.json(receipt, { status: 202 })),
      );
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    renderCheckout();
    await screen.findByDisplayValue(addresses[0].address);
    fireEvent.change(screen.getByLabelText("Fecha y hora de delivery"), {
      target: { value: "2099-12-10T12:00" },
    });
    await user.click(
      screen.getByRole("button", { name: "Enviar solicitud de delivery" }),
    );
    await screen.findByText("Solicitud registrada");
    const sent = fetcher.mock.calls.find(
      (call) => call[0] === "/bff/delivery-requests",
    )!;
    const payload = JSON.parse(sent[1].body);
    expect(payload).toMatchObject({
      address: addresses[0].address,
      reference: addresses[0].reference,
      contactPhone: addresses[0].contactPhone,
    });
    expect(payload).not.toHaveProperty("addressId");
  });
});
