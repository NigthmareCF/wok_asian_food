import { NewOrderView } from "@/modules/orders";
export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string | string[] }>;
}) {
  const { account } = await searchParams;
  return (
    <NewOrderView
      initialAccountId={Array.isArray(account) ? account[0] : account}
    />
  );
}
