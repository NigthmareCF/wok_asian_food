import { AppShell } from "@/shared/components/app-shell";
import { TableSessionProvider } from "@/modules/tables/table-session-provider";
import { OrderSessionProvider } from "@/modules/orders";
import { DeliverySessionProvider } from "@/modules/delivery";
import { PaymentsSessionProvider } from "@/modules/payments";
import { CashSessionProvider } from "@/modules/cash";
import { InventorySessionProvider } from "@/modules/inventory";
import { ProductionSessionProvider } from "@/modules/production";
import { ServiceStatusProvider } from "@/modules/service-status";
import { ReservationSessionProvider } from "@/modules/reservations";
import { MessagingSessionProvider } from "@/modules/messaging";
import { requireContext } from "@/modules/auth/server/auth-session";
import { FinancialAttemptProvider } from "@/modules/payments/financial-attempt-provider";

export default async function OperationalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const currentUser = await requireContext("operational");
  return (
    <AppShell context="operational" currentUser={currentUser}>
      <TableSessionProvider>
        <OrderSessionProvider>
          <DeliverySessionProvider>
            <PaymentsSessionProvider>
              <CashSessionProvider>
                <InventorySessionProvider>
                  <ProductionSessionProvider>
                    <ServiceStatusProvider>
                      <ReservationSessionProvider>
                        <MessagingSessionProvider>
                          <FinancialAttemptProvider
                            key={currentUser.userId}
                            userId={currentUser.userId}
                            permissions={currentUser.permissions}
                          >
                            {children}
                          </FinancialAttemptProvider>
                        </MessagingSessionProvider>
                      </ReservationSessionProvider>
                    </ServiceStatusProvider>
                  </ProductionSessionProvider>
                </InventorySessionProvider>
              </CashSessionProvider>
            </PaymentsSessionProvider>
          </DeliverySessionProvider>
        </OrderSessionProvider>
      </TableSessionProvider>
    </AppShell>
  );
}
