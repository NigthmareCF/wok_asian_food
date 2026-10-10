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
    { label: "Menú", route: "/client/menu", icon: "menu" },
    { label: "Delivery", route: "/client/delivery", icon: "delivery" },
    {
      label: "Pedidos",
      route: "/client/orders",
      icon: "orders",
    },
    {
      label: "Reservas",
      route: "/client/reservations/new",
      icon: "calendar",
    },
    {
      label: "Mensajes",
      route: "/client/messages",
      icon: "messages",
    },
    {
      label: "Ubicación",
      route: "/location",
      icon: "location",
    },
    {
      label: "Perfil",
      route: "/client/profile",
      icon: "people",
    },
  ],
  operational: [
    { label: "Operacion", route: "/operation", icon: "dashboard" },
    {
      label: "Mesas",
      route: "/operation/tables",
      icon: "tables",
      requiredPermission: "tables:manage",
    },
    {
      label: "Pedidos",
      route: "/operation/orders",
      icon: "orders",
      requiredPermission: "orders:manage",
    },
    {
      label: "Cocina",
      route: "/operation/kitchen",
      icon: "kitchen",
      requiredPermission: "kitchen:manage",
    },
    {
      label: "Reservas",
      route: "/operation/reservations",
      icon: "calendar",
    },
    {
      label: "Mensajes",
      route: "/operation/messages",
      icon: "messages",
    },
    {
      label: "Solicitudes",
      route: "/operation/online-requests",
      icon: "requests",
      requiredPermission: "orders:manage",
    },
    {
      label: "Delivery",
      route: "/operation/delivery",
      icon: "delivery",
    },
    {
      label: "Caja",
      route: "/operation/cash",
      icon: "cash",
      requiredPermission: "cash:manage",
    },
    {
      label: "Pagos",
      route: "/operation/payments",
      icon: "payments",
      requiredPermission: "payments:manage",
    },
    {
      label: "Inventario",
      route: "/operation/inventory",
      icon: "inventory",
      requiredPermission: "inventory:manage",
    },
    {
      label: "Produccion",
      route: "/operation/production",
      icon: "production",
      requiredPermission: "production:manage",
    },
    {
      label: "Estado del servicio",
      route: "/operation/status",
      icon: "status",
      requiredPermission: "service:manage",
    },
  ],
  admin: [
    { label: "Resumen", route: "/admin", icon: "dashboard" },
    {
      label: "Usuarios",
      route: "/admin/users",
      icon: "people",
      requiredPermission: "users:manage",
    },
    {
      label: "Roles y permisos",
      route: "/admin/roles",
      icon: "settings",
      requiredPermission: "users:manage",
    },
    {
      label: "Personal y horarios",
      route: "/admin/staff",
      icon: "calendar",
      requiredPermission: "users:manage",
    },
    {
      label: "Menu",
      route: "/admin/menu",
      icon: "menu",
    },
    {
      label: "Ajustes",
      route: "/admin/settings",
      icon: "settings",
    },
    {
      label: "Recetas",
      route: "/admin/recipes",
      icon: "menu",
    },
    {
      label: "Proveedores",
      route: "/admin/suppliers",
      icon: "delivery",
    },
    {
      label: "Compras",
      route: "/admin/purchases",
      icon: "orders",
    },
    {
      label: "Producción",
      route: "/admin/production",
      icon: "production",
    },
    {
      label: "Reportes",
      route: "/admin/reports",
      icon: "dashboard",
    },
    {
      label: "Cierres de caja",
      route: "/admin/cash-closings",
      icon: "cash",
    },
    {
      label: "Clientes",
      route: "/admin/clients",
      icon: "people",
    },
    {
      label: "IA y mensajería",
      route: "/admin/ai",
      icon: "messages",
    },
    {
      label: "Cámaras",
      route: "/admin/vision",
      icon: "requests",
    },
    {
      label: "Auditoría",
      route: "/admin/audit",
      icon: "orders",
      requiredPermission: "audit:read",
    },
  ],
};
