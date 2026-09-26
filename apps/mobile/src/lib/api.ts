const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}, accessToken?: string): Promise<T> {
  if (!baseUrl) throw new ApiError("Configura EXPO_PUBLIC_API_BASE_URL para conectar con WOK.");
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError("No pudimos conectar con WOK. Tu solicitud no se envió; intenta de nuevo cuando tengas conexión.");
  }
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: "La sesión no es válida. Inicia sesión nuevamente.",
      403: "Tu cuenta no tiene permiso para esta acción.",
      409: "La información cambió. Revisa los datos e inténtalo de nuevo.",
      422: "El restaurante no puede aceptar esta solicitud en ese horario.",
      503: "Este servicio está temporalmente indisponible.",
    };
    throw new ApiError(messages[response.status] ?? `No se pudo completar la solicitud (${response.status}).`, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export type TokenPair = { accessToken: string; refreshToken: string; expiresInSeconds: number };
export type ReservationResult = {
  requestId: string;
  reservationId: string | null;
  submitted: boolean;
  decision: "ACCEPT" | "ACCEPT_WITH_CONDITIONS" | "SUGGEST_OTHER_TIME" | "REQUIRES_HUMAN_APPROVAL" | "REJECT";
  reasonCodes: string[];
  minimumOccupancyMinutes: number;
  maximumOccupancyMinutes: number;
  message: string;
};
