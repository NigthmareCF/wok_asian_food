import { CheckoutPreview, getSafeCheckoutService } from "@/modules/checkout";
import { ClientDemoNavigation } from "@/modules/client-demo-navigation";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const { service } = await searchParams;
  return (
    <>
      <ClientDemoNavigation />
      <CheckoutPreview service={getSafeCheckoutService(service)} />
    </>
  );
}
