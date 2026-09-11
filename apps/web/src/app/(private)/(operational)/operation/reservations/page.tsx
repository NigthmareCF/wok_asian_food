import { OperationalPlaceholder } from "@/modules/operation";

export default function ReservationsPage() {
  return (
    <OperationalPlaceholder
      description="Consulta y administra la agenda de reservas del restaurante."
      nextSteps={[
        "Vistas día, semana y mes",
        "Búsqueda de clientes",
        "Creación y edición de reservas",
      ]}
      title="Reservas"
    />
  );
}
