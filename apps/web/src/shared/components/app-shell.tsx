"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bike,
  CalendarDays,
  ChefHat,
  CircleAlert,
  CircleDollarSign,
  Factory,
  LayoutDashboard,
  LayoutGrid,
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
  people: UsersRound,
  production: Factory,
  requests: CircleAlert,
  settings: Settings,
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
    "inventory.read",
    "production.read",
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
}: {
  children: React.ReactNode;
  context: NavigationContext;
}) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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

  return (
    <div
      className={`app-shell app-shell--${context} ${sidebarCollapsed ? "app-shell--sidebar-collapsed" : ""}`}
    >
      <aside className="sidebar">
        <div className="sidebar__header">
          <Link className="brand" href="/">
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
        <nav className="navigation" aria-label={`Navegacion ${context}`}>
          {visibleItems.map((item) => {
            const Icon = icons[item.icon];
            const active =
              pathname === item.route ||
              (item.route !== contextRoot &&
                pathname.startsWith(`${item.route}/`));
            return (
              <Link
                aria-current={active ? "page" : undefined}
                href={item.route}
                key={item.route}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <Icon aria-hidden="true" size={19} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        {context === "operational" ? (
          <div className="sidebar__context">
            <span className="live-dot" aria-hidden="true" />
            <div>
              <strong>Servicio normal</strong>
              <small>Datos simulados</small>
            </div>
          </div>
        ) : null}
      </aside>
      <main className="app-shell__main">{children}</main>
    </div>
  );
}
