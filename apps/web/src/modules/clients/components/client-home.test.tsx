import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientHome } from "./client-home";

vi.mock("./live-service-summary", () => ({
  LiveServiceSummary: () => (
    <aside aria-label="Estado de servicios">Capacidades publicadas</aside>
  ),
}));

const menu = {
  asOf: "2026-10-07T12:00:00Z",
  categories: [
    {
      id: "db-category",
      name: "Entradas",
      items: [
        {
          id: "db-gyozas",
          name: "Gyozas",
          description: "Gyozas del catálogo",
          price: 42.5,
          currency: "GTQ",
          estimatedPreparationSeconds: 120,
        },
      ],
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function expectNoFixtures() {
  expect(
    screen.queryByText(/Maki|Matcha|Datos demostrativos|25–35/),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/^(Abierto|Cerrado)$/)).not.toBeInTheDocument();
}

describe("Client home with public menu", () => {
  it("loads real categories, items and prices while preserving quick links", async () => {
    const fetchMenu = vi.fn().mockResolvedValue(Response.json(menu));
    vi.stubGlobal("fetch", fetchMenu);
    render(<ClientHome />);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando menú");
    expectNoFixtures();
    expect(
      await screen.findByRole("heading", { name: "Gyozas" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Entradas")).toHaveLength(2);
    expect(screen.getByText("Gyozas del catálogo")).toBeInTheDocument();
    expect(
      screen.getByText(
        new Intl.NumberFormat("es-GT", {
          style: "currency",
          currency: "GTQ",
        })
          .format(42.5)
          .replace(/\s/g, " "),
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(fetchMenu).toHaveBeenCalledExactlyOnceWith(
      "/bff/menu",
      expect.objectContaining({
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
    for (const [name, href] of [
      [/Menú \/ Pedir/, "/client/menu"],
      [/Reservar/, "/client/reservations/new"],
      [/Ubicación/, "/location"],
      [/Mensajes/, "/client/messages"],
    ] as const)
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    const service = screen.getByRole("complementary", {
      name: "Estado de servicios",
    });
    expect(
      within(service).getByText("Capacidades publicadas"),
    ).toBeInTheDocument();
    expectNoFixtures();
  });

  it("uses each item's currency and displays all returned items", async () => {
    const dollarItem = {
      ...menu.categories[0].items[0],
      id: "db-second",
      name: "Otra entrada",
      currency: "USD",
      price: 7.25,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          ...menu,
          categories: [
            {
              ...menu.categories[0],
              items: [...menu.categories[0].items, dollarItem],
            },
          ],
        }),
      ),
    );
    render(<ClientHome />);
    expect(
      await screen.findByRole("heading", { name: dollarItem.name }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        new Intl.NumberFormat("es-GT", {
          style: "currency",
          currency: "USD",
        })
          .format(7.25)
          .replace(/\s/g, " "),
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it.each([
    { categories: [] },
    {
      categories: [{ id: "empty-category", name: "Sin productos", items: [] }],
    },
  ])(
    "shows an empty catalog and explicitly reloads it: %j",
    async ({ categories }) => {
      const fetchMenu = vi
        .fn()
        .mockResolvedValueOnce(Response.json({ ...menu, categories }))
        .mockResolvedValueOnce(Response.json(menu));
      vi.stubGlobal("fetch", fetchMenu);
      const user = userEvent.setup();
      render(<ClientHome />);
      expect(
        await screen.findByText("El menú aún no tiene productos."),
      ).toBeInTheDocument();
      expect(screen.queryAllByRole("article")).toHaveLength(0);
      expectNoFixtures();
      await user.click(screen.getByRole("button", { name: "Reintentar" }));
      expect(
        await screen.findByRole("heading", { name: "Gyozas" }),
      ).toBeInTheDocument();
      expect(fetchMenu).toHaveBeenCalledTimes(2);
    },
  );

  it("limits the preview to six products while retaining categories", async () => {
    const items = Array.from({ length: 7 }, (_, index) => ({
      ...menu.categories[0].items[0],
      id: `item-${index}`,
      name: `Entrada ${index}`,
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          ...menu,
          categories: [
            { ...menu.categories[0], items },
            { id: "other", name: "Otra categoría", items: [] },
          ],
        }),
      ),
    );
    render(<ClientHome />);
    await screen.findByRole("heading", { name: "Entrada 0" });
    expect(screen.getAllByRole("article")).toHaveLength(6);
    expect(
      screen.queryByRole("heading", { name: "Entrada 6" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Otra categoría")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Ver menú completo/ }),
    ).toHaveAttribute("href", "/client/menu");
  });

  it.each(["network", "http", "invalid"])(
    "shows %s errors without fixtures and recovers on explicit retry",
    async (failure) => {
      const fetchMenu = vi.fn();
      if (failure === "network")
        fetchMenu.mockRejectedValueOnce(new Error("offline"));
      else
        fetchMenu.mockResolvedValueOnce(
          failure === "http"
            ? Response.json({}, { status: 503 })
            : Response.json({ categories: [] }),
        );
      let finishRetry!: (response: Response) => void;
      fetchMenu.mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finishRetry = resolve;
          }),
      );
      vi.stubGlobal("fetch", fetchMenu);
      const user = userEvent.setup();
      render(<ClientHome />);
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "No fue posible cargar el menú",
      );
      expect(screen.queryAllByRole("article")).toHaveLength(0);
      expectNoFixtures();
      expect(fetchMenu).toHaveBeenCalledTimes(1);
      await user.click(screen.getByRole("button", { name: "Reintentar" }));
      expect(screen.getByRole("status")).toHaveTextContent("Cargando menú");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      finishRetry(Response.json(menu));
      expect(
        await screen.findByRole("heading", { name: "Gyozas" }),
      ).toBeInTheDocument();
    },
  );

  it.each([
    ["/images/gyozas.jpg", true],
    ["https://images.example.com/gyozas.jpg", true],
    ["javascript:alert(1)", false],
    ["//images.example.com/gyozas.jpg", false],
    ["/\\images.example.com/gyozas.jpg", false],
    ["http://images.example.com/gyozas.jpg", false],
    ["https://user:secret@images.example.com/gyozas.jpg", false],
    [null, false],
  ])("uses only safe catalog images: %s", async (imageReference, visible) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          ...menu,
          categories: [
            {
              ...menu.categories[0],
              items: [{ ...menu.categories[0].items[0], imageReference }],
            },
          ],
        }),
      ),
    );
    render(<ClientHome />);
    await screen.findByRole("heading", { name: "Gyozas" });
    if (visible)
      expect(screen.getByRole("img", { name: "Gyozas" })).toHaveAttribute(
        "src",
        imageReference,
      );
    else {
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
      expect(screen.getByText("Sin fotografía")).toBeInTheDocument();
    }
  });
});
