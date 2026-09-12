export type AdminPermission = {
  id: string;
  label: string;
  group: string;
};

export type AdminRole = {
  id: string;
  name: string;
  permissionIds: string[];
};

export type RoleAuditEntry = {
  id: string;
  roleId: string;
  actor: string;
  performedAt: string;
  operation: "create" | "update";
  reason?: string;
};

export type RolePermissionViewState =
  "unchanged" | "dirty" | "saving" | "conflict";

export const dummyAdminPermissions: AdminPermission[] = [
  { group: "Usuarios demo", id: "users.read", label: "Consultar usuarios" },
  { group: "Usuarios demo", id: "users.update", label: "Editar usuarios" },
  { group: "Roles demo", id: "roles.read", label: "Consultar roles" },
  { group: "Roles demo", id: "roles.update", label: "Editar roles" },
  { group: "Reportes demo", id: "reports.read", label: "Consultar reportes" },
  {
    group: "Auditoría demo",
    id: "audit.read",
    label: "Consultar bitácora",
  },
];

export const dummyAdminRoles: AdminRole[] = [
  {
    id: "role-admin-demo",
    name: "Administración demo",
    permissionIds: ["users.read", "users.update", "roles.read", "roles.update"],
  },
  {
    id: "role-support-demo",
    name: "Soporte demo",
    permissionIds: ["users.read", "roles.read", "reports.read"],
  },
  {
    id: "role-audit-demo",
    name: "Auditoría demo",
    permissionIds: ["roles.read", "audit.read"],
  },
];

export const initialRoleAuditEntries: RoleAuditEntry[] = [
  {
    actor: "Administración demo",
    id: "RAUD-001",
    operation: "update",
    performedAt: "2026-09-12 10:20",
    reason: "Ajuste simulado de permisos",
    roleId: "role-admin-demo",
  },
];
