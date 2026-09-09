import { AppShell } from "@/shared/components/app-shell";
export default function ClientLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AppShell context="client">{children}</AppShell>;
}
