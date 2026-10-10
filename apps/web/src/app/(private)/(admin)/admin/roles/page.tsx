import { LiveUserManagement } from "@/modules/users/components/live-user-management";
import { requireContext } from "@/modules/auth/server/auth-session";

export default async function AdminRolesPage() {
  const user = await requireContext("admin");
  return (
    <>
      <p>
        Permisos efectivos de tu sesión:{" "}
        {user.permissions.join(", ") || "Sin permisos"}. Los permisos se
        consultan al servidor; la asignación disponible es por roles.
      </p>
      <LiveUserManagement key={user.userId} userId={user.userId} />
    </>
  );
}
