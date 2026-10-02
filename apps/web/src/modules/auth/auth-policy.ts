import type { NavigationContext } from "@/config/navigation";

const contextRoles: Record<NavigationContext, string> = {
  admin: "ADMIN",
  client: "CLIENT",
  operational: "OPERATIONAL",
};

export function canAccessContext(
  roles: readonly string[],
  context: NavigationContext,
) {
  return roles.includes(contextRoles[context]);
}

export function landingPathForRoles(roles: readonly string[]) {
  if (roles.includes("ADMIN")) return "/admin";
  if (roles.includes("OPERATIONAL")) return "/operation";
  return "/client";
}
