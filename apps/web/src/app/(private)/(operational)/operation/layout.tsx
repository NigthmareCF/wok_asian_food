import { AppShell } from "@/shared/components/app-shell";
import { TableSessionProvider } from "@/modules/tables/table-session-provider";
import { OrderSessionProvider } from "@/modules/orders";
import { DeliverySessionProvider } from "@/modules/delivery";
import { PaymentsSessionProvider } from "@/modules/payments";
import { CashSessionProvider } from "@/modules/cash";
import { InventorySessionProvider } from "@/modules/inventory";
import { ProductionSessionProvider } from "@/modules/production";
import { ServiceStatusProvider } from "@/modules/service-status";

export default function OperationalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AppShell context="operational">
      <TableSessionProvider>
        <OrderSessionProvider>
          <DeliverySessionProvider>
            <PaymentsSessionProvider>
              <CashSessionProvider>
                <InventorySessionProvider>
                  <ProductionSessionProvider>
                    <ServiceStatusProvider>{children}</ServiceStatusProvider>
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