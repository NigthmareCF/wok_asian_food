import { NewOrderView } from "@/modules/orders";

type NewOrderPageProps = {
  searchParams: Promise<{
    table?: string | string[];
    tables?: string | string[];
    account?: string | string[];
    accountName?: string | string[];
  }>;
};

const firstValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

export default async function NewOrderPage({
  searchParams,
}: NewOrderPageProps) {
  const params = await searchParams;
  return (
    <NewOrderView
      initialJoinedTableNumbers={firstValue(params.tables)}
      initialTableNumber={firstValue(params.table)}
      initialAccountId={firstValue(params.account)}
      initialAccountName={firstValue(params.accountName)}
    />
  );
}
