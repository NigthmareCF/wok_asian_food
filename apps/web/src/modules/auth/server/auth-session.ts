import { redirect } from "next/navigation";
import type { NavigationContext } from "@/config/navigation";
import {
  canAccessContext,
  landingPathForRoles,
} from "@/modules/auth/auth-policy";
import type { AuthenticatedUser } from "@/modules/auth/auth-types";
import { readAccessToken } from "@/modules/auth/server/auth-cookies";
import { loadCurrentUser } from "@/modules/auth/server/backend-auth";

export async function currentSession(): Promise<AuthenticatedUser | null> {
  const accessToken = await readAccessToken();
  if (!accessToken) return null;

  try {
    return await loadCurrentUser(accessToken);
  } catch {
    return null;
  }
}

export async function requireContext(context: NavigationContext) {
  const user = await currentSession();
  if (!user)
    redirect(
      `/login?next=/${context === "operational" ? "operation" : context}`,
    );
  if (!canAccessContext(user.roles, context))
    redirect(landingPathForRoles(user.roles));
  return user;
}
