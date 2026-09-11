import { OperationalPlaceholder } from "@/modules/operation";

export default function CashPage() {
  return (
    <OperationalPlaceholder
      description="Controla movimientos y cierre de caja con confirmaciones visibles."
      nextSteps={[
        "Gastos y retiros",
        "Resumen del turno",
        "Diferencias y cierre autorizado",
      ]}
      title="Caja"
    />
  );
}
