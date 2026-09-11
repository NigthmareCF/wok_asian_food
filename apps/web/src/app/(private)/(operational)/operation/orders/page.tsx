import { OperationalPlaceholder } from "@/modules/operation";

export default function OrdersPage() {
  return (
    <OperationalPlaceholder
      description="Da seguimiento a comandas presenciales, delivery y pedidos para recoger."
      nextSteps={[
        "Búsqueda y filtros por estado",
        "Detalle y trazabilidad",
        "Cambios y anulaciones",
      ]}
      title="Pedidos"
    />
  );
}
