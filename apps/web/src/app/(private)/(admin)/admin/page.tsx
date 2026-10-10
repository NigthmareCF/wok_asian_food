import { BackendUnavailable } from "@/shared/components/backend-unavailable";
export default function Page() {
  return (
    <BackendUnavailable
      title="Dashboard administrativo"
      contract="Faltan contratos de indicadores por período, alertas, productos críticos y sugerencias de compra y producción."
    />
  );
}
