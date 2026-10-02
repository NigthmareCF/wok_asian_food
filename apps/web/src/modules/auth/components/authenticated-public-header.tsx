import { landingPathForRoles } from "@/modules/auth/auth-policy";
import { currentSession } from "@/modules/auth/server/auth-session";
import { PublicHeader } from "@/shared/components/public-header";

export async function AuthenticatedPublicHeader() {
  const user = await currentSession();
  return (
    <PublicHeader
      accountHref={user ? landingPathForRoles(user.roles) : undefined}
    />
  );
}
