import { AppShell } from "@/shared/components/app-shell";
export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AppShell context="admin">{children}</AppShell>;
}
