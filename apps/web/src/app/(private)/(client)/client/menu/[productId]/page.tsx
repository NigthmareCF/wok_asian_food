import { notFound } from "next/navigation";
import { isUuid } from "@/modules/checkout/pickup-contract";
import { LiveProductDetail } from "@/modules/menu/components/live-product-detail";
export default async function ClientProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  if (!isUuid(productId)) notFound();
  return <LiveProductDetail key={productId} productId={productId} />;
}
