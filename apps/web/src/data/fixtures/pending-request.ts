export type PendingRequestStatus =
  | "highDemand"
  | "degradedService"
  | "offline"
  | "reconnecting"
  | "pendingConfirmation";

export const pendingRequestFixture: {
  initialStatus: PendingRequestStatus;
  retryDelayMs: number;
  retryResult: PendingRequestStatus;
} = {
  initialStatus: "degradedService",
  retryDelayMs: 650,
  retryResult: "pendingConfirmation",
};

export const pendingRequestMessages: Record<
  PendingRequestStatus,
  { label: string; message: string }
> = {
  highDemand: {
    label: "Alta demanda",
    message:
      "Estamos atendiendo una alta demanda. Tu solicitud sigue en espera y aún no ha sido aceptada.",
  },
  degradedService: {
    label: "Servicio temporalmente limitado",
    message:
      "Estamos presentando inconvenientes temporales. Puedes esperar o volver a revisar tu carrito.",
  },
  offline: {
    label: "Conexión interrumpida",
    message:
      "No podemos comprobar el estado de tu solicitud. Conservamos tus artículos en esta sesión; puedes reintentar cuando recuperes la conexión.",
  },
  reconnecting: {
    label: "Intentando reconectar",
    message:
      "Estamos volviendo a comprobar la conexión. Tu selección sigue intacta y no se crea otra solicitud.",
  },
  pendingConfirmation: {
    label: "Pendiente de confirmación",
    message:
      "La revisión local terminó. Tu solicitud sigue pendiente; esto no significa que el restaurante la haya aceptado.",
  },
};
