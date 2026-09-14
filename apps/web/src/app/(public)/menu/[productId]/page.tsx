import { notFound } from "next/navigation";
import { menuFixtures } from "@/data/fixtures/menu";
import { ProductDetail } from "@/modules/menu";

export function generateStaticParams() {
  return menuFixtures.map((product) => ({ productId: product.id }));
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const product = menuFixtures.find((entry) => entry.id === productId);
  if (!product) notFound();
  return <ProductDetail key={product.id} product={product} />;
}
