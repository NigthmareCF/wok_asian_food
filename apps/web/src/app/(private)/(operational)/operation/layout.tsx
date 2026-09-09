import { AppShell } from "@/shared/components/app-shell";
export default function OperationalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AppShell context="operational">{children}</AppShell>;
}
