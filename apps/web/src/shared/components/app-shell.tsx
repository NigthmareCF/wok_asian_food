"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { usePathname } from "next/navigation";
import {
  Bike,
  CalendarDays,
  ChefHat,
  CircleDollarSign,
  Factory,
  LayoutDashboard,
  LayoutGrid,
  MapPin,
  MessagesSquare,
  PackageSearch,
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
  admin: ["users.read", "menu.read", "settings.read"],
};

export function AppShell({
  children,
  context,
  contextualActions,
}: {
  children: React.ReactNode;
  context: NavigationContext;
  contextualActions?: React.ReactNode;
}) {
  const pathname = usePathname();
  const demoDialog = useRef<HTMLDialogElement>(null);
  const [demoContent, setDemoContent] = useState({ title: "", message: "" });
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
    <div className={`app-shell app-shell--${context}`}>
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span>WOK</span> ASIAN FOOD
        </Link>
        <nav
          className="navigation"
          aria-label={
            context === "client"
              ? "Navegación de cliente"
              : `Navegacion ${context}`
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
                aria-current={active ? "page" : undefined}
                href={item.route}
                key={item.route}
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
      <main className="app-shell__main">
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
