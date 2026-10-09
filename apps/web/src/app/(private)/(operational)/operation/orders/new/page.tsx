import { OperationalOrderBuilder } from "@/modules/orders";
import { requireContext } from "@/modules/auth/server/auth-session";

type NewOrderPageProps = {
  searchParams: Promise<{
    account?: string | string[];
    accountName?: string | string[];
    orderId?: string | string[];
  }>;
};

const firstValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

export default async function NewOrderPage({
  searchParams,
}: NewOrderPageProps) {
  const params = await searchParams;
  const user = await requireContext("operational");
  return (
    <OperationalOrderBuilder
      key={`${user.userId}:${firstValue(params.account)}:${firstValue(params.orderId) ?? "new"}`}
      userId={user.userId}
      accountId={firstValue(params.account)}
      accountName={firstValue(params.accountName)}
      orderId={firstValue(params.orderId)}
    />
  );
}
