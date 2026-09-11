import { OperationalPlaceholder } from "@/modules/operation";

export default function DeliveryPage() {
  return (
    <OperationalPlaceholder
      description="Coordina pedidos de entrega desde su preparación hasta la recogida."
      nextSteps={[
        "Datos de entrega y pago",
        "Asignación de repartidor",
        "Llegada y recogida",
      ]}
      title="Delivery"
    />
  );
}
