import { FinancialAttemptProvider } from "@/modules/payments/financial-attempt-provider";
import { PaymentDetailView } from "@/modules/payments/components/payment-detail-view";
import { authorizeAdministrativePaymentPage } from "@/modules/payments/server/attempt-endpoint";
export default async function AdministrativePaymentAttemptPage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { accountId } = await params;
  const search = await searchParams;
  const user = await authorizeAdministrativePaymentPage({ accountId, search });
  return (
    <FinancialAttemptProvider
      key={user.userId}
      userId={user.userId}
      permissions={user.permissions}
    >
      <PaymentDetailView
        key={accountId + ":" + String(search.reviewAttempt)}
        recordId={accountId}
        administrativeAttemptId={search.reviewAttempt as string}
      />
    </FinancialAttemptProvider>
  );
}
