export type Permission =
  `${string}.${"read" | "create" | "update" | "delete" | "manage"}`;

export function hasPermission(
  granted: readonly Permission[],
  required: Permission,
) {
  return granted.includes(required);
}

export function hasAnyPermission(
  granted: readonly Permission[],
  required: readonly Permission[],
) {
  return (
    required.length > 0 &&
    required.some((permission) => hasPermission(granted, permission))
  );
}

export function hasAllPermissions(
  granted: readonly Permission[],
  required: readonly Permission[],
) {
  return required.every((permission) => hasPermission(granted, permission));
}
