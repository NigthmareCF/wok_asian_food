import { OperationalPlaceholder } from "@/modules/operation";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return (
    <OperationalPlaceholder
      description="Revisa productos, tiempos y cambios de una comanda específica."
      nextSteps={[
        "Productos y responsables",
        "Historial de cambios",
        "Edición y anulación confirmada",
      ]}
      title={`Pedido ${orderId}`}
    />
  );
}
