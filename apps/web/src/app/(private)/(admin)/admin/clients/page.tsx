import { BackendUnavailable } from "@/shared/components/backend-unavailable";
export default function Page() {
  return (
    <BackendUnavailable
      title="Clientes administrativos"
      contract="Faltan contratos administrativos de historial, incidencias y aplicación o retiro de restricciones de clientes."
    />
  );
}
