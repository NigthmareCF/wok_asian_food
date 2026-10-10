import { BackendUnavailable } from "@/shared/components/backend-unavailable";
export default function Page() {
  return (
    <BackendUnavailable
      title="Configuración del restaurante"
      contract="Faltan contratos de consulta y actualización de ubicación, horarios, límites, propina, tolerancia y políticas del restaurante."
    />
  );
}
