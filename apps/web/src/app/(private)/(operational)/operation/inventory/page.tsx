import { OperationalPlaceholder } from "@/modules/operation";

export default function InventoryPage() {
  return (
    <OperationalPlaceholder
      description="Consulta existencias físicas, reservadas y disponibles para el servicio."
      nextSteps={[
        "Búsqueda y filtros",
        "Entradas y ajustes",
        "Lotes y caducidad",
      ]}
      title="Inventario"
    />
  );
}
