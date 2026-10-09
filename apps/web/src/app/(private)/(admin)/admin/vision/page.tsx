import { BackendUnavailable } from "@/shared/components/backend-unavailable";
export default function Page() {
  return (
    <BackendUnavailable
      title="Cámaras"
      contract="Faltan contratos de cámaras, señales, confianza y confirmación o rechazo de detecciones."
    />
  );
}
