export type UserStatus = "active" | "suspended" | "disabled" | "pending";

export type AdminUserRole = {
  id: string;
  name: string;
  capabilities: string[];
};

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  status: UserStatus;
  roles: AdminUserRole[];
};

export type UserAuditEntry = {
  id: string;
  userId: string;
  actor: string;
  performedAt: string;
  operation: "create" | "edit" | "activate" | "suspend";
  reason?: string;
};

export const userStatusLabels: Record<UserStatus, string> = {
  active: "Activo",
  disabled: "Desactivado",
  pending: "Acceso pendiente",
  suspended: "Suspendido",
};

export const dummyAdminRoles: AdminUserRole[] = [
  {
    id: "role-admin-demo",
    name: "Administración demo",
    capabilities: [
      "Consultar usuarios",
      "Editar usuarios",
      "Consultar reportes",
    ],
  },
  {
    id: "role-support-demo",
    name: "Soporte demo",
    capabilities: [
      "Consultar usuarios",
      "Consultar roles asignados",
      "Consultar reportes",
    ],
  },
  {
    id: "role-audit-demo",
    name: "Auditoría demo",
    capabilities: ["Consultar roles asignados", "Consultar bitácora simulada"],
  },
];

export const dummyAdminUsers: AdminUser[] = [
  {
    id: "USR-101",
    name: "Mariana López",
    email: "mariana.lopez@wok.demo",
    status: "active",
    roles: [dummyAdminRoles[0], dummyAdminRoles[1]],
  },
  {
    id: "USR-102",
    name: "Carlos Méndez",
    email: "carlos.mendez@wok.demo",
    status: "suspended",
    roles: [dummyAdminRoles[2]],
  },
  {
    id: "USR-103",
    name: "Lucía Herrera",
    email: "lucia.herrera@wok.demo",
    status: "pending",
    roles: [dummyAdminRoles[1]],
  },
  {
    id: "USR-104",
    name: "Daniel Reyes",
    email: "daniel.reyes@wok.demo",
    status: "disabled",
    roles: [dummyAdminRoles[2]],
  },
];

export const initialUserAuditEntries: UserAuditEntry[] = [
  {
    actor: "Administración demo",
    id: "AUD-001",
    operation: "edit",
    performedAt: "2026-09-12 09:15",
    reason: "Ajuste simulado de roles",
    userId: "USR-101",
  },
];
