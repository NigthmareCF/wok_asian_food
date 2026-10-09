import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";

const permissionsByContext = {
  admin: [
    "users.read",
    "roles.read",
    "staff.read",
    "menu.read",
    "settings.read",
    "recipes.read",
    "suppliers.read",
    "purchases.read",
    "production.read",
    "reports.read",
    "cash.read",
    "clients.read",
    "ai.read",
    "vision.read",
    "audit.read",
  ],
  client: ["orders.read"],
  operational: [
    "tables.read",
    "orders.read",
    "kitchen.read",
    "reservations.read",
    "messages.read",
    "delivery.read",
    "cash.read",
    "payments.read",
    "inventory.read",
    "production.read",
    "status.read",
  ],
} as const;

function currentUserFor(context: keyof typeof permissionsByContext) {
  return {
    userId: `${context}-test`,
    displayName: "Usuario de prueba",
    email: `${context}@example.test`,
    roles: [context === "operational" ? "OPERATIONAL" : context.toUpperCase()],
    permissions: [...permissionsByContext[context]],
    status: "ACTIVE",
  };
}

const pathState = vi.hoisted(() => ({ pathname: "/operation" }));
const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
const navigation = vi.hoisted(() => ({ replacePage: vi.fn() }));
vi.mock("@/modules/auth/auth-navigation", () => navigation);

const expectedNavigationRoutes = {
  admin: {
    Ajustes: "/admin/settings",
    Auditoría: "/admin/audit",
    "Cierres de caja": "/admin/cash-closings",
    Clientes: "/admin/clients",
    Compras: "/admin/purchases",
    "IA y mensajería": "/admin/ai",
    Menu: "/admin/menu",
    "Personal y horarios": "/admin/staff",
    Producción: "/admin/production",
    Proveedores: "/admin/suppliers",
    Recetas: "/admin/recipes",
    Reportes: "/admin/reports",
    Resumen: "/admin",
    "Roles y permisos": "/admin/roles",
    Usuarios: "/admin/users",
    Cámaras: "/admin/vision",
  },
  client: {
    Inicio: "/client",
    Mensajes: "/client/messages",
    Menú: "/menu",
    Pedidos: "/client/orders",
    Reservas: "/client/reservations/new",
    Ubicación: "/location",
  },
  operational: {
    Caja: "/operation/cash",
    Cocina: "/operation/kitchen",
    Delivery: "/operation/delivery",
    "Estado del servicio": "/operation/status",
    Inventario: "/operation/inventory",
    Mesas: "/operation/tables",
    Mensajes: "/operation/messages",
    Operacion: "/operation",
    Pagos: "/operation/payments",
    Pedidos: "/operation/orders",
    Produccion: "/operation/production",
    Reservas: "/operation/reservations",
    Solicitudes: "/operation/online-requests",
  },
} as const;

function expectNavigationRoutes(
  context: keyof typeof expectedNavigationRoutes,
) {
  for (const [label, route] of Object.entries(
    expectedNavigationRoutes[context],
  )) {
    expect(screen.getByRole("link", { name: label })).toHaveAttribute(
      "href",
      route,
    );
  }
}

vi.mock("next/navigation", () => ({
  usePathname: () => pathState.pathname,
  useRouter: () => router,
}));

afterEach(() => {
  pathState.pathname = "/operation";
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  cleanup();
});

describe("AppShell", () => {
  it("keeps the session and reports an unsuccessful logout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const user = userEvent.setup();
    render(
      <AppShell
        context="client"
        currentUser={{
          userId: "test",
          displayName: "Cliente",
          email: "test@example.test",
          roles: ["CLIENT"],
          permissions: [],
          status: "ACTIVE",
        }}
      >
        Contenido
      </AppShell>,
    );
    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo cerrar la sesión",
    );
    expect(navigation.replacePage).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeEnabled();
  });
  it("clears local state and navigates only after logout succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const onLogout = vi.fn();
    window.addEventListener("wok:logout", onLogout);
    try {
      const user = userEvent.setup();
      render(
        <AppShell
          context="client"
          currentUser={{
            userId: "test",
            displayName: "Cliente",
            email: "test@example.test",
            roles: ["CLIENT"],
            permissions: [],
            status: "ACTIVE",
          }}
        >
          Contenido
        </AppShell>,
      );
      await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
      expect(onLogout).toHaveBeenCalledOnce();
      expect(navigation.replacePage).toHaveBeenCalledWith("/login");
    } finally {
      window.removeEventListener("wok:logout", onLogout);
    }
  });
  it("preserves client links and exposes Perfil as a real route when the sidebar is collapsed", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AppShell context="client" currentUser={currentUserFor("client")}>
        <div>Contenido cliente</div>
      </AppShell>,
    );
    const dialog = container.querySelector("dialog")!;
    const showModal = vi.fn(() => dialog.setAttribute("open", ""));
    const close = vi.fn(() => dialog.removeAttribute("open"));
    Object.defineProperties(dialog, {
      showModal: { value: showModal, configurable: true },
      close: { value: close, configurable: true },
    });

    await user.click(screen.getByRole("button", { name: "Contraer menú" }));
    expect(
      screen.getByRole("navigation", { name: "Navegación de cliente" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inicio" })).toHaveAttribute(
      "href",
      "/client",
    );
    expect(
      screen.getByRole("link", { name: "WOK Asian Food" }),
    ).toHaveAttribute("href", "/client");
    expect(screen.getByRole("link", { name: "Menú" })).toHaveAttribute(
      "href",
      "/menu",
    );
    expect(screen.getByRole("link", { name: "Pedidos" })).toHaveAttribute(
      "href",
      "/client/orders",
    );
    expectNavigationRoutes("client");
    const profileLink = screen.getByRole("link", { name: "Perfil" });
    expect(profileLink).toHaveAttribute("href", "/client/profile");
    await user.click(profileLink);
    expect(dialog).not.toHaveAttribute("open");
    expect(showModal).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Expandir menú" }));
    expect(container.firstChild).not.toHaveClass(
      "app-shell--sidebar-collapsed",
    );
  });

  it("collapses and restores the operational navigation", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AppShell
        context="operational"
        currentUser={currentUserFor("operational")}
      >
        <div>Contenido operativo</div>
      </AppShell>,
    );

    await user.click(screen.getByRole("button", { name: "Contraer menú" }));
    expect(container.firstChild).toHaveClass("app-shell--sidebar-collapsed");
    expect(screen.getByRole("link", { name: "Mesas" })).toHaveAttribute(
      "title",
      "Mesas",
    );
    expect(
      screen.getByRole("link", { name: "WOK Asian Food" }),
    ).toHaveAttribute("href", "/operation");
    expectNavigationRoutes("operational");

    await user.click(screen.getByRole("button", { name: "Expandir menú" }));
    expect(container.firstChild).not.toHaveClass(
      "app-shell--sidebar-collapsed",
    );
  });

  it("shows admin-only management entries in the admin navigation", () => {
    pathState.pathname = "/admin";
    const { rerender } = render(
      <AppShell context="admin" currentUser={currentUserFor("admin")}>
        <div>Contenido administrativo</div>
      </AppShell>,
    );

    expect(
      screen.getByRole("link", { name: "Roles y permisos" }),
    ).toHaveAttribute("href", "/admin/roles");
    expect(
      screen.getByRole("link", { name: "Personal y horarios" }),
    ).toHaveAttribute("href", "/admin/staff");
    expect(
      screen.getByRole("link", { name: "WOK Asian Food" }),
    ).toHaveAttribute("href", "/admin");
    expectNavigationRoutes("admin");

    pathState.pathname = "/operation";
    rerender(
      <AppShell
        context="operational"
        currentUser={currentUserFor("operational")}
      >
        <div>Contenido operativo</div>
      </AppShell>,
    );

    expect(
      screen.queryByRole("link", { name: "Roles y permisos" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Personal y horarios" }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ["admin", "/admin"],
    ["client", "/client"],
    ["operational", "/operation"],
  ] as const)("links the %s brand to its channel home", (context, route) => {
    render(
      <AppShell context={context} currentUser={currentUserFor(context)}>
        <div>Contenido del canal</div>
      </AppShell>,
    );

    expect(
      screen.getByRole("link", { name: "WOK Asian Food" }),
    ).toHaveAttribute("href", route);
  });

  it("does not show navigation entries without the corresponding permission", () => {
    render(
      <AppShell
        context="operational"
        currentUser={{
          ...currentUserFor("operational"),
          permissions: ["tables.read"],
        }}
      >
        Contenido
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: "Mesas" })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Pedidos" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Pagos" }),
    ).not.toBeInTheDocument();
  });
});
