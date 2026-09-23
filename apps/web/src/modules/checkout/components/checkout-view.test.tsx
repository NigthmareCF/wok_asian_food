import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCheckoutPreviewSnapshot } from "@/data/fixtures/checkout-preview";
import { CartProvider, useCart } from "@/modules/cart";
import { menuFixtures } from "@/data/fixtures/menu";
import { CheckoutView } from "./checkout-view";
import { ClientCheckout } from "./client-checkout";

afterEach(cleanup);
describe("CheckoutView", () => {
  it.each(["table", "pickup", "delivery"] as const)(
    "keeps %s free of technical service controls and unauthorized payment methods",
    (service) => {
      render(
        <CheckoutView
          snapshot={createCheckoutPreviewSnapshot(service)}
          actions={{ onRevalidate: vi.fn(), onConfirm: vi.fn() }}
        />,
      );
      expect(
        screen.queryByText("Probar tipos de servicio"),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("MÉTODO DE PAGO")).not.toBeInTheDocument();
      expect(screen.queryByText(/gratis|Q0.00/)).not.toBeInTheDocument();
      if (service === "table") {
        expect(screen.queryByText(/Q[0-9]/)).not.toBeInTheDocument();
        expect(
          screen.queryByText(/Subtotal|propina|Opciones de pago/i),
        ).not.toBeInTheDocument();
      } else expect(screen.getByText("Q385.00")).toBeInTheDocument();
      expect(
        screen.getByRole("button", {
          name:
            service === "table" ? "ENVIAR SOLICITUD" : "CONFIRMAR SOLICITUD",
        }),
      ).toBeDisabled();
    },
  );
});

function CartSetup() {
  const cart = useCart();
  return (
    <>
      <button
        onClick={() =>
          cart.addItem({
            productId: "panko",
            quantity: 2,
            selectedOptions: { "tuna-only": "tuna-only" },
          })
        }
      >
        Add configured product
      </button>
      <button
        onClick={() => {
          cart.addItem({
            productId: menuFixtures.find(
              (p) => p.availability !== "unavailable" && !p.options?.length,
            )!.id,
            quantity: 2,
            selectedOptions: {},
          });
        }}
      >
        Add product
      </button>
      <button onClick={() => cart.setService("pickup")}>Pickup</button>
      <button onClick={() => cart.setService("table")}>Table</button>
      <output aria-label="Cart count">{cart.items.length}</output>
    </>
  );
}
describe("ClientCheckout with C-05", () => {
  it("uses the configured product quantities, choices and subtotal from C-05", async () => {
    const user = userEvent.setup();
    render(
      <CartProvider>
        <CartSetup />
        <ClientCheckout />
      </CartProvider>,
    );
    await user.click(screen.getByText("Add configured product"));
    await user.click(screen.getByText("Pickup"));
    expect(screen.getByText("2 × Panko · Solo atún")).toBeInTheDocument();
    expect(screen.getAllByText("Q150.00")).toHaveLength(2);
  });
  it.each(["unavailable", "invalid-options"])(
    "blocks %s after adding a product",
    async (conflict) => {
      const user = userEvent.setup();
      const products = menuFixtures.map((product) =>
        product.id !== "panko"
          ? product
          : conflict === "unavailable"
            ? { ...product, availability: "unavailable" as const }
            : { ...product, options: [] },
      );
      render(
        <CartProvider>
          <CartSetup />
          <ClientCheckout products={products} />
        </CartProvider>,
      );
      await user.click(screen.getByText("Add configured product"));
      await user.click(screen.getByText("Pickup"));
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "CONFIRMAR SOLICITUD" }),
      ).not.toBeInTheDocument();
    },
  );
  it("handles empty and missing service, revalidates and never clears or submits while completion is unavailable", async () => {
    const user = userEvent.setup();
    render(
      <CartProvider>
        <CartSetup />
        <ClientCheckout />
      </CartProvider>,
    );
    expect(
      screen.getByRole("heading", { name: "Tu pedido está vacío" }),
    ).toBeInTheDocument();
    await user.click(screen.getByText("Add product"));
    expect(
      screen.getByRole("heading", { name: "Selecciona un servicio" }),
    ).toBeInTheDocument();
    await user.click(screen.getByText("Pickup"));
    expect(
      screen.getByText("Tipo de servicio: Para recoger"),
    ).toBeInTheDocument();
    await user.click(screen.getByText("REVALIDAR SOLICITUD"));
    expect(screen.getByText(/Datos locales revisados/)).toHaveAttribute(
      "role",
      "status",
    );
    await user.click(screen.getByText("Table"));
    expect(
      screen.queryByText("Datos locales revisados", { exact: false }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ENVIAR SOLICITUD" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Cart count")).toHaveTextContent("1");
  });
  it("blocks a product that disappeared since adding it", async () => {
    const user = userEvent.setup();
    render(
      <CartProvider>
        <CartSetup />
        <ClientCheckout products={[]} />
      </CartProvider>,
    );
    await user.click(screen.getByText("Add product"));
    await user.click(screen.getByText("Pickup"));
    expect(screen.getByRole("alert")).toHaveTextContent("no disponibles");
    expect(
      screen.queryByRole("button", { name: "CONFIRMAR SOLICITUD" }),
    ).not.toBeInTheDocument();
  });
});
