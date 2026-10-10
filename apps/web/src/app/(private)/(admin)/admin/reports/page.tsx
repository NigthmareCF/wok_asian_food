import { BackendUnavailable } from "@/shared/components/backend-unavailable";
export default function Page() {
  return (
    <BackendUnavailable
      title="Reportes"
      contract="Faltan contratos de ventas, costos, margen, filtros por período y canal y exportación autorizada."
    />
  );
}
