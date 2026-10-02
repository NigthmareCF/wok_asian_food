import { AdminWorkspaceProvider } from "@/modules/admin-workspace";
import { requireContext } from "@/modules/auth/server/auth-session";
import { AppShell } from "@/shared/components/app-shell";
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const currentUser = await requireContext("admin");
  return (
    <AdminWorkspaceProvider>
      <AppShell context="admin" currentUser={currentUser}>
        {children}
      </AppShell>
    </AdminWorkspaceProvider>
  );
}
