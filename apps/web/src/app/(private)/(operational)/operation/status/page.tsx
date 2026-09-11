import { OperationalPlaceholder } from "@/modules/operation";

export default function OperationStatusPage() {
  return (
    <OperationalPlaceholder
      description="Define el modo visible del servicio y documenta el motivo del cambio."
      nextSteps={[
        "Selección de estado",
        "Motivo obligatorio",
        "Confirmación y trazabilidad simulada",
      ]}
      title="Estado del servicio"
    />
  );
}
