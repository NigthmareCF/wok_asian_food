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

export function postLoginDestination(
  next: string | null,
  roles: readonly string[],
) {
  const fallback = landingPathForRoles(roles);
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    /[\\\x00-\x1f]/.test(next)
  )
    return fallback;

  try {
    const url = new URL(next, "https://wok.local");
    const context = url.pathname.match(
      /^\/(client|admin|operation)(?:\/|$)/,
    )?.[1];
    const navigationContext = context === "operation" ? "operational" : context;
    if (
      url.origin !== "https://wok.local" ||
      !navigationContext ||
      !canAccessContext(roles, navigationContext as NavigationContext)
    )
      return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
