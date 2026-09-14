import type { Permission } from "@/shared/lib/permissions";

export type NavigationContext = "client" | "operational" | "admin";
export type NavigationIcon =
  | "calendar"
  | "cash"
  | "dashboard"
  | "delivery"
  | "inventory"
  | "kitchen"
  | "location"
  | "menu"
  | "messages"
  | "orders"
  | "payments"
  | "people"
  | "production"
  | "requests"
  | "settings"
  | "status"
  | "tables";
export type NavigationItem = {
  label: string;
  route: string;
  icon: NavigationIcon;
  requiredPermission?: Permission;
  featureFlag?: boolean;
  demoNotice?: string;
};

export const navigation: Record<NavigationContext, NavigationItem[]> = {
  client: [
    { label: "Inicio", route: "/client", icon: "dashboard" },
    { label: "Menú", route: "/menu", icon: "menu" },
    {
      label: "Pedidos",
      route: "/client/orders",
      icon: "orders",
      requiredPermission: "orders.read",
      demoNotice:
        "El seguimiento de pedidos aún no está habilitado. Este acceso es demostrativo y no consulta pedidos reales.",
    },
    {
      label: "Perfil",
      route: "/client/profile",
      icon: "people",
      demoNotice:
        "El perfil aún no está habilitado. Este acceso es demostrativo y no consulta ni modifica datos personales.",
    },
  ],
  operational: [
    { label: "Operacion", route: "/operation", icon: "dashboard" },
    {
      label: "Mesas",
      route: "/operation/tables",
      icon: "tables",
      requiredPermission: "tables.read",
    },
    {
      label: "Pedidos",
      route: "/operation/orders",
      icon: "orders",
      requiredPermission: "orders.read",
    },
    {
      label: "Cocina",
      route: "/operation/kitchen",
      icon: "kitchen",
      requiredPermission: "kitchen.read",
    },
    {
      label: "Reservas",
      route: "/operation/reservations",
      icon: "calendar",
      requiredPermission: "reservations.read",
    },
    {
      label: "Mensajes",
      route: "/operation/messages",
      icon: "messages",
      requiredPermission: "messages.read",
    },
    {
      label: "Solicitudes",
      route: "/operation/online-requests",
      icon: "requests",
      requiredPermission: "messages.read",
    },
    {
      label: "Delivery",
      route: "/operation/delivery",
      icon: "delivery",
      requiredPermission: "delivery.read",
    },
    {
      label: "Caja",
      route: "/operation/cash",
      icon: "cash",
      requiredPermission: "cash.read",
    },
    {
      label: "Pagos",
      route: "/operation/payments",
      icon: "payments",
      requiredPermission: "payments.read",
    },
    {
      label: "Inventario",
      route: "/operation/inventory",
      icon: "inventory",
      requiredPermission: "inventory.read",
    },
    {
      label: "Produccion",
      route: "/operation/production",
      icon: "production",
      requiredPermission: "production.read",
    },
    {
      label: "Estado del servicio",
      route: "/operation/status",
      icon: "status",
      requiredPermission: "status.read",
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
