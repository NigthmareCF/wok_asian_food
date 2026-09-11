import { OperationalPlaceholder } from "@/modules/operation";

export default function NewOrderPage() {
  return (
    <OperationalPlaceholder
      description="Construye una comanda con productos, modificadores y disponibilidad simulada."
      nextSteps={[
        "Categorías y búsqueda",
        "Modificadores del producto",
        "Carrito y envío a cocina",
      ]}
      title="Nuevo pedido"
    />
  );
}
