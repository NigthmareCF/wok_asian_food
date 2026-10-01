import { AdminWorkspaceProvider } from "@/modules/admin-workspace";
import { AppShell } from "@/shared/components/app-shell";
export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AdminWorkspaceProvider>
      <AppShell context="admin">{children}</AppShell>
    </AdminWorkspaceProvider>
  );
}
