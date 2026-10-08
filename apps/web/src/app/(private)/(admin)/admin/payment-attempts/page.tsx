import { FinancialAttemptProvider } from "@/modules/payments/financial-attempt-provider";
import { PaymentsListView } from "@/modules/payments/components/payments-list-view";
import { authorizeAdministrativePaymentPage } from "@/modules/payments/server/attempt-endpoint";
export default async function AdministrativePaymentAttemptsPage() {
  const user = await authorizeAdministrativePaymentPage();
  return (
    <FinancialAttemptProvider
      key={user.userId}
      userId={user.userId}
      permissions={user.permissions}
    >
      <PaymentsListView administrativeOnly />
    </FinancialAttemptProvider>
  );
}
