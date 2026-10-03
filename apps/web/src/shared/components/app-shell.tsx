"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bike,
  CalendarDays,
  ChefHat,
  CircleAlert,
  CircleDollarSign,
  CreditCard,
  Factory,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  MapPin,
  MessagesSquare,
  PackageSearch,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Settings,
  UtensilsCrossed,
  UsersRound,
} from "lucide-react";
import {
  navigation,
  type NavigationContext,
  type NavigationIcon,
} from "@/config/navigation";
import { hasPermission, type Permission } from "@/shared/lib/permissions";
import type { AuthenticatedUser } from "@/modules/auth/auth-types";
import { replacePage } from "@/modules/auth/auth-navigation";

const icons: Record<NavigationIcon, typeof LayoutDashboard> = {
  calendar: CalendarDays,
  cash: CircleDollarSign,
  dashboard: LayoutDashboard,
  delivery: Bike,
  inventory: PackageSearch,
  kitchen: ChefHat,
  location: MapPin,
  menu: UtensilsCrossed,
  messages: MessagesSquare,
  orders: ReceiptText,
  payments: CreditCard,
  people: UsersRound,
  production: Factory,
  requests: CircleAlert,
  settings: Settings,
  status: Activity,
  tables: LayoutGrid,
};

const mockPermissions: Record<NavigationContext, Permission[]> = {
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
};

export function AppShell({
  children,
  context,
  contextualActions,
  currentUser,
}: {
  children: React.ReactNode;
  context: NavigationContext;
  contextualActions?: React.ReactNode;
  currentUser?: AuthenticatedUser;
}) {
  const pathname = usePathname();
  const demoDialog = useRef<HTMLDialogElement>(null);
  const [demoContent, setDemoContent] = useState({ title: "", message: "" });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string>();
  const contextRoot = {
    admin: "/admin",
    client: "/client",
    operational: "/operation",
  }[context];
  const visibleItems = navigation[context].filter(
    (item) =>
      item.featureFlag !== false &&
      (!item.requiredPermission ||
        hasPermission(mockPermissions[context], item.requiredPermission)),
  );

  async function logout() {
    setIsLoggingOut(true);
    setLogoutError(undefined);
    try {
      const response = await fetch("/bff/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed");
      window.dispatchEvent(new Event("wok:logout"));
      replacePage("/login");
    } catch {
      setLogoutError("No se pudo cerrar la sesión. Intenta de nuevo.");
      setIsLoggingOut(false);
    }
  }

  return (
    <div
      className={`app-shell app-shell--${context} ${sidebarCollapsed ? "app-shell--sidebar-collapsed" : ""}`}
    >
      <aside className="sidebar">
        <div className="sidebar__header">
          <Link
            aria-label="WOK Asian Food"
            className="brand"
            href={contextRoot}
          >
            <span className="brand__mark">WOK</span>
            <span className="brand__name"> ASIAN FOOD</span>
          </Link>
          <button
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? "Expandir menú" : "Contraer menú"}
            className="sidebar__toggle"
            onClick={() => setSidebarCollapsed((current) => !current)}
            title={sidebarCollapsed ? "Expandir menú" : "Contraer menú"}
            type="button"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen aria-hidden="true" size={18} />
            ) : (
              <PanelLeftClose aria-hidden="true" size={18} />
            )}
          </button>
        </div>
        <nav
          className="navigation"
          aria-label={
            context === "client"
              ? "Navegación de cliente"
              : `Navegación ${context}`
          }
        >
          {visibleItems.map((item) => {
            const Icon = icons[item.icon];
            const active =
              pathname === item.route ||
              (item.route !== contextRoot &&
                pathname.startsWith(`${item.route}/`));
            if (item.demoNotice) {
              return (
                <button
                  key={item.route}
                  type="button"
                  aria-haspopup="dialog"
                  aria-label={item.label}
                  title={
                    sidebarCollapsed && context !== "client"
                      ? `${item.label} (Demo)`
                      : undefined
                  }
                  onClick={() => {
                    setDemoContent({
                      title: item.label,
                      message: item.demoNotice ?? "",
                    });
                    demoDialog.current?.showModal();
                  }}
                >
                  <Icon aria-hidden="true" size={19} />
                  <span>
                    {item.label}
                    <small>Demo</small>
                  </span>
                </button>
              );
            }
            return (
              <Link
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                href={item.route}
                key={item.route}
                title={
                  sidebarCollapsed && context !== "client"
                    ? item.label
                    : undefined
                }
              >
                <Icon aria-hidden="true" size={19} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        {currentUser ? (
          <div className="sidebar__session">
            <div>
              <strong>{currentUser.displayName}</strong>
              <small>{currentUser.email}</small>
            </div>
            <button
              aria-label="Cerrar sesión"
              disabled={isLoggingOut}
              onClick={logout}
              title="Cerrar sesión"
              type="button"
            >
              <LogOut aria-hidden="true" size={18} />
            </button>
          </div>
        ) : null}
        {context === "operational" ? (
          <div className="sidebar__context">
            <span className="live-dot" aria-hidden="true" />
            <div>
              <strong>Servicio normal</strong>
              <small>Estado del servicio simulado</small>
            </div>
          </div>
        ) : null}
      </aside>
      <main className="app-shell__main">
        {logoutError ? (
          <p className="form-feedback form-feedback--error" role="alert">
            {logoutError}
          </p>
        ) : null}
        {contextualActions}
        {children}
      </main>
      {context === "client" ? (
        <dialog
          className="client-demo-dialog"
          ref={demoDialog}
          aria-labelledby="client-demo-title"
          aria-describedby="client-demo-description"
        >
          <span className="eyebrow">DEMOSTRATIVO</span>
          <h2 id="client-demo-title">{demoContent.title}</h2>
          <p id="client-demo-description">{demoContent.message}</p>
          <Button type="button" onClick={() => demoDialog.current?.close()}>
            Entendido
          </Button>
        </dialog>
      ) : null}
    </div>
  );
}
