import { AppShell } from "@/shared/components/app-shell";
import { TableSessionProvider } from "@/modules/tables/table-session-provider";

export default function OperationalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AppShell context="operational">
      <TableSessionProvider>{children}</TableSessionProvider>
    </AppShell>
  );
}
