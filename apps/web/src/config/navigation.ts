import type { Permission } from "@/shared/lib/permissions";

export type NavigationContext = "client" | "operational" | "admin";
export type NavigationIcon =
  "dashboard" | "menu" | "orders" | "people" | "settings" | "location";
export type NavigationItem = {
  label: string;
  route: string;
  icon: NavigationIcon;
  requiredPermission?: Permission;
  featureFlag?: boolean;
};

export const navigation: Record<NavigationContext, NavigationItem[]> = {
  client: [
    { label: "Inicio", route: "/client", icon: "dashboard" },
    { label: "Menu", route: "/menu", icon: "menu" },
    { label: "Ubicacion", route: "/location", icon: "location" },
    {
      label: "Pedidos",
      route: "/client/orders",
      icon: "orders",
      requiredPermission: "orders.read",
      featureFlag: false,
    },
    {
      label: "Perfil",
      route: "/client/profile",
      icon: "people",
      featureFlag: false,
    },
  ],
  operational: [
    { label: "Operacion", route: "/operation", icon: "dashboard" },
    {
      label: "Mesas",
      route: "/operation/tables",
      icon: "people",
      requiredPermission: "tables.read",
      featureFlag: false,
    },
    {
      label: "Pedidos",
      route: "/operation/orders",
      icon: "orders",
      requiredPermission: "orders.read",
      featureFlag: false,
    },
    {
      label: "Cocina",
      route: "/operation/kitchen",
      icon: "menu",
      requiredPermission: "kitchen.read",
      featureFlag: false,
    },
  ],
  admin: [
    { label: "Resumen", route: "/admin", icon: "dashboard" },
    {
      label: "Usuarios",
      route: "/admin/users",
      icon: "people",
      requiredPermission: "users.read",
      featureFlag: false,
    },
    {
      label: "Menu",
      route: "/admin/menu",
      icon: "menu",
      requiredPermission: "menu.read",
      featureFlag: false,
    },
    {
      label: "Ajustes",
      route: "/admin/settings",
      icon: "settings",
      requiredPermission: "settings.read",
      featureFlag: false,
    },
  ],
};
