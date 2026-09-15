import {
  cleanup,
  render as testingRender,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { menuFixtures, type MenuProduct } from "@/data/fixtures/menu";
import { ProductConfigurator } from "./product-configurator";
import { configureProduct } from "../lib/configure-product";

import { CartProvider } from "@/modules/cart/cart-provider";

const render = (ui: React.ReactElement) =>
  testingRender(ui, { wrapper: CartProvider });

afterEach(cleanup);
function product(id: string): MenuProduct {
  const item = menuFixtures.find((entry) => entry.id === id);
  if (!item) throw new Error(`Missing fixture: ${id}`);
  return item;
}

describe("Product configuration", () => {
  it("calculates optional supplements per unit and resets confirmation on change", async () => {
    const user = userEvent.setup();
    render(<ProductConfigurator product={product("panko")} />);
    expect(
      screen.getByRole("button", { name: "Reducir cantidad" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: /Solo atún/ }));
    expect(
      screen.getByRole("button", { name: "Agregar al pedido · Q75" }),
    ).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Aumentar cantidad" }));
    await user.click(
      screen.getByRole("button", { name: "Agregar al pedido · Q150" }),
    );
    expect(screen.getByText(/agregado a tu pedido local/)).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /Sin suplemento/ }));
    expect(
      screen.queryByText(/agregado a tu pedido local/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Agregar al pedido · Q140" }),
    ).toBeEnabled();
  });

  it("requires exactly one specialty base and supports keyboard selection", async () => {
    const user = userEvent.setup();
    render(<ProductConfigurator product={product("orange-chicken")} />);
    expect(
      screen.getByRole("button", { name: /Agregar al pedido/ }),
    ).toBeDisabled();
    const rice = screen.getByRole("radio", { name: /Arroz frito/ });
    rice.focus();
    await user.keyboard(" ");
    expect(rice).toBeChecked();
    expect(
      screen.getByRole("button", { name: "Agregar al pedido · Q65" }),
    ).toBeEnabled();
    await user.click(screen.getByRole("radio", { name: /Chao mein/ }));
    expect(rice).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /Chao mein/ })).toBeChecked();
  });

  it("calculates the oniguiris supplement without product-name logic", async () => {
    const user = userEvent.setup();
    render(
      <ProductConfigurator
        product={{ ...product("oniguiris-tuna"), name: "Producto de prueba" }}
      />,
    );
    await user.click(screen.getByRole("radio", { name: /Fritos en panko/ }));
    expect(
      screen.getByRole("button", { name: "Agregar al pedido · Q50" }),
    ).toBeEnabled();
  });

  it("omits option controls for products without options", () => {
    render(<ProductConfigurator product={product("maki-tuna")} />);
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Agregar al pedido · Q70" }),
    ).toBeEnabled();
  });

  it("blocks an unavailable product, including an availability change", () => {
    const item = product("panko");
    const { rerender } = render(<ProductConfigurator product={item} />);
    rerender(
      <ProductConfigurator
        product={{ ...item, availability: "unavailable" }}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Agregar al pedido/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Aumentar cantidad" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Este producto no está disponible/),
    ).toBeInTheDocument();
    for (const radio of screen.getAllByRole("radio"))
      expect(radio).toBeDisabled();
  });

  it("rejects invalid selections and quantities without including unknown supplements", () => {
    const item = product("panko");
    expect(configureProduct(item, { "tuna-only": "unknown" }, 1).canAdd).toBe(
      false,
    );
    expect(configureProduct(item, { "tuna-only": "unknown" }, 1).total).toBe(
      70,
    );
    for (const quantity of [0, -1, 1.5, NaN, Infinity]) {
      expect(configureProduct(item, {}, quantity).canAdd).toBe(false);
    }
  });
});
