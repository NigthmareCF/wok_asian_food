import { BackendUnavailable } from "@/shared/components/backend-unavailable";
export default function Page() {
  return (
    <BackendUnavailable
      title="IA y plantillas"
      contract="Faltan contratos autorizados de plantillas, capacidades de IA y revisión humana de propuestas."
    />
  );
}
