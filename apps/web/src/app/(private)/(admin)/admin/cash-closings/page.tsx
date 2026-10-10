import { BackendUnavailable } from "@/shared/components/backend-unavailable";
export default function Page() {
  return (
    <BackendUnavailable
      title="Cierres de caja históricos"
      contract="Falta un contrato de búsqueda paginada de cierres históricos. La consulta de una sesión por ID no proporciona un reporte histórico."
    />
  );
}
