import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { homeMenuProducts, menuFixtures } from "@/data/fixtures/menu";
import { MenuCatalog } from "./menu-catalog";

afterEach(cleanup);

describe("Menu catalog", () => {
  it("combines category and accent-insensitive name search, then resets", async () => {
    const user = userEvent.setup();
    render(<MenuCatalog products={menuFixtures} />);
    const search = screen.getByRole("searchbox", { name: "Buscar en el menú" });
    await user.type(search, "  ATUN  ");
    expect(screen.getAllByRole("article")).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "Bebidas" }));
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(
      screen.getByText("No encontramos productos con esa búsqueda."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(search).toHaveFocus();
    expect(search).toHaveValue("");
    expect(screen.getAllByRole("article")).toHaveLength(33);
    expect(screen.getByRole("button", { name: "Todos" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps every category reachable even when it has no products", async () => {
    const user = userEvent.setup();
    render(
      <MenuCatalog
        products={menuFixtures.filter((p) => p.categoryId === "sushi")}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Extras" }));
    expect(
      screen.getByText("Esta categoría aún no tiene productos."),
    ).toBeInTheDocument();
  });

  it("shows an empty catalog without inventing products", () => {
    render(<MenuCatalog products={[]} />);
    expect(
      screen.getByText("El menú aún no tiene productos."),
    ).toBeInTheDocument();
  });

  it("shows unavailable products, modifiers and alcohol without purchase actions", () => {
    render(<MenuCatalog products={menuFixtures} />);
    const blueMatcha = screen.getByRole("article", { name: "Blue Matcha" });
    expect(within(blueMatcha).getByText("No disponible")).toBeInTheDocument();
    const panko = screen.getByRole("article", { name: "Panko" });
    expect(within(panko).getByText("Solo atún +Q5.")).toBeInTheDocument();
    expect(within(panko).getByText("Opciones disponibles")).toBeInTheDocument();
    expect(
      within(screen.getByRole("article", { name: "Soju" })).getByText(
        "Bebidas +18",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/La disponibilidad es demostrativa/),
    ).toHaveLength(1);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /agregar/i }),
    ).not.toBeInTheDocument();
  });

  it("supports keyboard category activation", async () => {
    const user = userEvent.setup();
    render(<MenuCatalog products={menuFixtures} />);
    screen.getByRole("button", { name: "Bebidas +18" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Bebidas +18" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps home previews consistent with catalog prices and IDs", () => {
    for (const preview of homeMenuProducts.filter((p) => p.homePreview)) {
      expect(menuFixtures.find((p) => p.id === preview.id)?.price).toBe(
        preview.price,
      );
    }
    expect(new Set(menuFixtures.map((p) => p.id)).size).toBe(33);
    for (const product of menuFixtures.filter(
      (p) => p.categoryId === "specialties",
    )) {
      expect(
        product.options?.[0].choices.map((choice) => choice.priceAdjustment),
      ).toEqual([0, 0, 0]);
    }
  });
});
