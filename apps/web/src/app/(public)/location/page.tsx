import { AuthenticatedPublicHeader } from "@/modules/auth/components/authenticated-public-header";
import { BackendUnavailable } from "@/shared/components/backend-unavailable";
export default function LocationPage() {
  return (
    <main className="public-page">
      <AuthenticatedPublicHeader />
      <div className="public-page__content">
        <BackendUnavailable
          title="Ubicación y horarios"
          contract="Falta un contrato público de dirección, coordenadas, horarios y enlace de navegación aprobado."
        />
      </div>
    </main>
  );
}
