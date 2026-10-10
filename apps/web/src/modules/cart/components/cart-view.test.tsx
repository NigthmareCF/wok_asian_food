import {
  act,
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
import type { PendingRequestStatus } from "@/data/fixtures/pending-request";

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});
const panko = menuFixtures.find((p) => p.id === "panko")!;

function Harness({
  products = menuFixtures,
  initialPendingStatus,
}: {
  products?: readonly MenuProduct[];
  initialPendingStatus?: PendingRequestStatus;
}) {
  return (
    <CartProvider>
      <ProductConfigurator product={panko} />
      <CartLink />
      <CartView
        products={products}
        initialPendingStatus={initialPendingStatus}
      />
    </CartProvider>
  );
}

describe("Client cart", () => {
  it.each([undefined, "degradedService"] as const)(
    "revalidates %s and exposes checkout without losing configuration",
    async (initialPendingStatus) => {
      const user = userEvent.setup();
      render(<Harness initialPendingStatus={initialPendingStatus} />);
      await user.click(screen.getByRole("radio", { name: /Solo atún/ }));
      await user.click(
        screen.getByRole("button", { name: "Aumentar cantidad" }),
      );
      await user.click(
        screen.getByRole("button", { name: "Agregar al pedido · Q150" }),
      );
      await user.click(screen.getByRole("radio", { name: "Para recoger" }));
      expect(
        screen.queryByRole("link", { name: "Continuar al checkout" }),
      ).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Continuar" }));
      expect(
        screen.getByRole("button", { name: "Revalidando disponibilidad…" }),
      ).toBeDisabled();
      if (initialPendingStatus) {
        await user.click(
          await screen.findByRole("button", { name: "Esperar" }),
        );
        expect(
          screen.getByRole("button", { name: "Revalidando disponibilidad…" }),
        ).toBeDisabled();
      }
      expect(
        await screen.findByRole("link", { name: "Continuar al checkout" }),
      ).toHaveAttribute("href", "/client/checkout");
      expect(
        screen.getByRole("link", { name: "Tu pedido, 2 artículos" }),
      ).toBeInTheDocument();
      expect(screen.getAllByText(/Q150/).length).toBeGreaterThan(0);
      if (initialPendingStatus) {
        await user.click(screen.getByRole("button", { name: "Cancelar" }));
      } else {
        await user.click(
          screen.getByRole("button", { name: "Aumentar cantidad de Panko" }),
        );
      }
      expect(
        screen.queryByRole("link", { name: "Continuar al checkout" }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("article", { name: "Panko" })).toHaveTextContent(
        "Solo atún",
      );
    },
  );
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
      "/client/menu",
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

  it("preserves explicit limited scenarios and cancellation without losing products", async () => {
    const user = userEvent.setup();
    render(<Harness initialPendingStatus="degradedService" />);
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

  it("restores the tab cart after remount and clears it on logout", async () => {
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
    expect(screen.getByRole("article", { name: "Panko" })).toBeInTheDocument();
    act(() => window.dispatchEvent(new Event("wok:logout")));
    expect(
      screen.getByRole("heading", { name: "Tu pedido está vacío" }),
    ).toBeInTheDocument();
    expect(window.sessionStorage.getItem("wok.cart.v1")).toBeNull();
  });
});
