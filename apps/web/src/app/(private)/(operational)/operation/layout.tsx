import { AppShell } from "@/shared/components/app-shell";
import { TableSessionProvider } from "@/modules/tables/table-session-provider";
import { OrderSessionProvider } from "@/modules/orders";
import { ReservationSessionProvider } from "@/modules/reservations";
import { MessagingSessionProvider } from "@/modules/messaging";

export default function OperationalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AppShell context="operational">
      <TableSessionProvider>
        <OrderSessionProvider>
          <ReservationSessionProvider>
            <MessagingSessionProvider>{children}</MessagingSessionProvider>
          </ReservationSessionProvider>
        </OrderSessionProvider>
      </TableSessionProvider>
    </AppShell>
  );
}
