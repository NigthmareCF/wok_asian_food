import { AppShell } from "@/shared/components/app-shell";
import { TableSessionProvider } from "@/modules/tables/table-session-provider";
import { OrderSessionProvider } from "@/modules/orders";

export default function OperationalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AppShell context="operational">
      <TableSessionProvider>
        <OrderSessionProvider>{children}</OrderSessionProvider>
      </TableSessionProvider>
    </AppShell>
  );
}
