import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveMenuCatalog } from "./live-menu-catalog";
import { LiveCartProvider } from "@/modules/cart/live-cart-provider";

const menu = {
  asOf: "2026-10-02T12:00:00Z",
  categories: [
    {
      id: "backend-category",
      name: "Especiales",
      items: [
        {
          id: "00000000-0000-4000-8000-000000000042",
          name: "Atún",
          description: "Del catálogo real",
          price: 42.5,
          currency: "GTQ",
          estimatedPreparationSeconds: 120,
        },
      ],
    },
    { id: "empty-category", name: "Bebidas", items: [] },
  ],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("live menu", () => {
  it("loads backend categories and prices and filters without fixture identifiers", async () => {
    installMenuFetch(vi.fn().mockResolvedValue(Response.json(menu)));
    const user = userEvent.setup();
    render(
      <LiveCartProvider>
        <LiveMenuCatalog />
      </LiveCartProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Cargando");
    expect(
      await screen.findByRole("heading", { name: "Atún" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/42.50/)).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox"), "ATUN");
    expect(screen.getAllByRole("article")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Bebidas" }));
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Ver detalle/ })).toHaveAttribute(
      "href",
      "/client/menu/00000000-0000-4000-8000-000000000042",
    );
  });

  it("shows an error and successfully retries instead of falling back to fixtures", async () => {
    installMenuFetch(
      vi
        .fn()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValueOnce(Response.json(menu)),
    );
    const user = userEvent.setup();
    render(
      <LiveCartProvider>
        <LiveMenuCatalog />
      </LiveCartProvider>,
    );
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(
      await screen.findByRole("heading", { name: "Atún" }),
    ).toBeInTheDocument();
  });

  it("shows a genuinely empty backend catalog", async () => {
    installMenuFetch(
      vi.fn().mockResolvedValue(Response.json({ ...menu, categories: [] })),
    );
    render(
      <LiveCartProvider>
        <LiveMenuCatalog />
      </LiveCartProvider>,
    );
    expect(
      await screen.findByText("El menú aún no tiene productos."),
    ).toBeInTheDocument();
  });
});

function installMenuFetch(menuFetch: typeof fetch) {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, options?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const pathname = new URL(url, "http://mock.invalid").pathname;
    if (pathname === "/bff/auth/session")
      return Promise.resolve(Response.json({}, { status: 401 }));
    if (pathname === "/bff/menu") return menuFetch(input, options);
    throw new Error(`Unexpected menu test URL: ${pathname}`);
  });
}
