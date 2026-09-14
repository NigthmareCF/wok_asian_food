import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { menuFixtures, type MenuProduct } from "@/data/fixtures/menu";
import { ProductConfigurator } from "@/modules/menu/components/product-configurator";
import { CartProvider } from "../cart-provider";
import { CartView } from "./cart-view";
import { CartLink } from "./cart-link";

afterEach(cleanup);
const panko = menuFixtures.find((p) => p.id === "panko")!;

function Harness({
  products = menuFixtures,
}: {
  products?: readonly MenuProduct[];
}) {
  return (
    <CartProvider>
      <ProductConfigurator product={panko} />
      <CartLink />
      <CartView products={products} />
    </CartProvider>
  );
}

describe("Client cart", () => {
  it("starts empty with a route to the menu", () => {
    render(
      <CartProvider>
        <CartView />
      </CartProvider>,
    );
    expect(
      screen.getByRole("heading", { name: "Tu pedido está vacío" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver menú" })).toHaveAttribute(
      "href",
      "/menu",
    );
  });

  it("receives C-04 modifiers, updates quantities, announces deletion and preserves minimum one", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("radio", { name: /Solo atún/ }));
    await user.click(screen.getByRole("button", { name: "Aumentar cantidad" }));
    await user.click(
      screen.getByRole("button", { name: "Agregar al pedido · Q150" }),
    );
    const item = within(screen.getByRole("article", { name: "Panko" }));
    expect(item.getByText("Preparación: Solo atún +Q5")).toBeInTheDocument();
    expect(screen.getByLabelText("Subtotal del pedido")).toHaveTextContent(
      "Q150",
    );
    expect(
      screen.getByRole("link", { name: "Tu pedido, 2 artículos" }),
    ).toBeInTheDocument();
    await user.click(
      item.getByRole("button", { name: "Reducir cantidad de Panko" }),
    );
    expect(screen.getByLabelText("Subtotal del pedido")).toHaveTextContent(
      "Q75",
    );
    expect(
      item.getByRole("button", { name: "Reducir cantidad de Panko" }),
    ).toBeDisabled();
    await user.click(item.getByRole("button", { name: "Eliminar Panko" }));
    expect(
      screen.getByRole("heading", { name: "Tu pedido está vacío" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tu pedido" })).toHaveFocus();
  });

  it("revalidates locally and stops before checkout or confirmation", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(
      screen.getByRole("button", { name: "Agregar al pedido · Q70" }),
    );
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    screen.getByRole("radio", { name: "Para recoger" }).focus();
    await user.keyboard(" ");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(
      screen.getByRole("button", { name: "Revalidando disponibilidad…" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Eliminar Panko" }),
    ).toBeDisabled();
    await waitFor(
      () =>
        expect(
          screen.getByRole("heading", {
            name: "Aún no podemos confirmar tu pedido.",
          }),
        ).toHaveFocus(),
      { timeout: 2000 },
    );
    await user.click(screen.getByRole("button", { name: "Avisarme" }));
    expect(screen.getByText(/no se enviarán SMS/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Volver al carrito" }));
    await user.click(
      screen.getByRole("button", { name: "Ver solicitud pendiente" }),
    );
    await user.click(screen.getByRole("button", { name: "Esperar" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByLabelText("Subtotal del pedido")).toHaveTextContent(
      "Q70",
    );
    await user.click(
      screen.getByRole("button", { name: "Aumentar cantidad de Panko" }),
    );
    expect(
      screen.queryByText(/Revisión local completada/),
    ).not.toBeInTheDocument();
  });

  it("keeps newly unavailable products visible and blocks advancement", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness />);
    await user.click(
      screen.getByRole("button", { name: "Agregar al pedido · Q70" }),
    );
    await user.click(screen.getByRole("radio", { name: "Mesa" }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    rerender(
      <Harness
        products={menuFixtures.map((p) =>
          p.id === "panko" ? { ...p, availability: "unavailable" } : p,
        )}
      />,
    );
    expect(screen.getByRole("article", { name: "Panko" })).toBeInTheDocument();
    expect(screen.getByText("No disponible")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    expect(
      screen.queryByText(/Revisión local completada/),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Eliminar Panko" }));
    expect(
      screen.getByRole("heading", { name: "Tu pedido está vacío" }),
    ).toBeInTheDocument();
  });

  it("does not persist after the provider is remounted", async () => {
    const user = userEvent.setup();
    const first = render(<Harness />);
    await user.click(
      screen.getByRole("button", { name: "Agregar al pedido · Q70" }),
    );
    first.unmount();
    render(
      <CartProvider>
        <CartView />
      </CartProvider>,
    );
    expect(
      screen.getByRole("heading", { name: "Tu pedido está vacío" }),
    ).toBeInTheDocument();
  });
});
