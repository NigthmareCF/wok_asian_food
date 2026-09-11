import { OperationalPlaceholder } from "@/modules/operation";

export default function MessagesPage() {
  return (
    <OperationalPlaceholder
      description="Atiende conversaciones y solicitudes que requieren intervención humana."
      nextSteps={[
        "Bandeja por estado",
        "Toma y transferencia",
        "Contexto de cliente y pedido",
      ]}
      title="Mensajes"
    />
  );
}
