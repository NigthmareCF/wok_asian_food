import { BackendUnavailable } from "@/shared/components/backend-unavailable";
export default function Page() {
  return (
    <BackendUnavailable
      title="Auditoría"
      contract="Falta un contrato autorizado de búsqueda, paginación y detalle de eventos de auditoría."
    />
  );
}
