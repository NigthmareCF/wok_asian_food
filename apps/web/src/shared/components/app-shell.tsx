"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MapPin,
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
  dashboard: LayoutDashboard,
  location: MapPin,
  menu: UtensilsCrossed,
  orders: ReceiptText,
  people: UsersRound,
  settings: Settings,
};

const mockPermissions: Record<NavigationContext, Permission[]> = {
  client: ["orders.read"],
  operational: ["tables.read", "orders.read", "kitchen.read"],
  admin: ["users.read", "menu.read", "settings.read"],
};

export function AppShell({
  children,
  context,
}: {
  children: React.ReactNode;
  context: NavigationContext;
}) {
  const pathname = usePathname();
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
        <nav className="navigation" aria-label={`Navegacion ${context}`}>
          {visibleItems.map((item) => {
            const Icon = icons[item.icon];
            const active =
              pathname === item.route ||
              (item.route !== `/${context}` &&
                pathname.startsWith(`${item.route}/`));
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
      </aside>
      <main className="app-shell__main">{children}</main>
    </div>
  );
}
