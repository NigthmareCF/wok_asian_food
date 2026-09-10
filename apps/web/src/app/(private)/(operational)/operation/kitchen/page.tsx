import { OperationalPlaceholder } from "@/modules/operation";

export default function KitchenPage() {
  return (
    <OperationalPlaceholder
      description="Organiza la producción de cocina por estado, estación y prioridad."
      nextSteps={[
        "Columnas KDS",
        "Control de ETA",
        "Estados nuevos, listos y retrasados",
      ]}
      title="Cocina"
    />
  );
}
