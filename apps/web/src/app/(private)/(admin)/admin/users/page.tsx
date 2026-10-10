import { LiveUserManagement } from "@/modules/users/components/live-user-management";
import { requireContext } from "@/modules/auth/server/auth-session";

export default async function AdminUsersPage() {
  const user = await requireContext("admin");
  return <LiveUserManagement key={user.userId} userId={user.userId} />;
}
