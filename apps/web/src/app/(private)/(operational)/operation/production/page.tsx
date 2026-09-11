import { OperationalPlaceholder } from "@/modules/operation";

export default function ProductionPage() {
  return (
    <OperationalPlaceholder
      description="Registra producción, rendimiento y disponibilidad de preparaciones."
      nextSteps={[
        "Producciones activas",
        "Rendimiento y correcciones",
        "Sugerencias simuladas",
      ]}
      title="Producción"
    />
  );
}
