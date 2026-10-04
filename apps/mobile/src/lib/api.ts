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
export type ClientProfile = { userId: string; email: string; displayName: string; phone?: string | null; version: number };
export type ClientSession = {
  sessionId: string;
  clientType: "WEB" | "MOBILE" | "DESKTOP";
  deviceName?: string | null;
  createdAt: string;
  lastActivityAt: string;
  current: boolean;
};
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
export type ReservationHistoryItem = {
  requestId: string;
  reservationId?: string | null;
  requestedAt?: string | null;
  guests?: number | null;
  decision: ReservationResult["decision"];
  reservationStatus?: string | null;
  message: string;
  submittedAt: string;
};
export type PublicMenu = {
  categories: PublicMenuCategory[];
  asOf: string;
};
export type PublicMenuCategory = {
  id: string;
  name: string;
  displayOrder: number;
  items: PublicMenuItem[];
};
export type PublicMenuItem = {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  currency: string;
  imageReference?: string | null;
  estimatedPreparationSeconds: number;
  displayOrder: number;
};
export type PickupRequestBody = {
  requestedFor: string;
  customerNote?: string;
  items: { menuItemId: string; quantity: number }[];
};
export type PickupRequestReceipt = {
  requestId: string;
  status: "PENDING_REVIEW" | "ACCEPTED" | "REJECTED" | "CANCELLED" | "EXPIRED";
  requestedFor: string;
  subtotal: number;
  currencyId: string;
  currency: string;
  idempotentReplay: boolean;
  decisionReason: string | null;
  message: string;
};
export type PickupRequestState = PickupRequestReceipt;
export type PickupRequestDetails = PickupRequestState & {
  customerNote: string | null;
  items: { name: string; quantity: number; unitPrice: number; lineTotal: number; currencyId: string }[];
};
export type PickupOrderTracking = {
  requestId: string;
  orderCode: string;
  status: "SENT" | "PREPARING" | "READY" | "SERVED" | "CLOSED" | "CANCELLED";
  requestedFor: string;
  estimatedReadyAt: string | null;
  updatedAt: string;
};
export type DeliveryRequestBody = {
  requestedFor: string;
  customerNote?: string;
  address: string;
  reference?: string;
  contactPhone: string;
  paymentPreference: "CASH_ON_DELIVERY" | "ONLINE_PAYMENT_REQUESTED";
  items: { menuItemId: string; quantity: number }[];
};
export type DeliveryRequestReceipt = {
  requestId: string;
  fulfillmentType: "DELIVERY";
  status: "PENDING_REVIEW" | "ACCEPTED" | "REJECTED" | "CANCELLED" | "EXPIRED";
  requestedFor: string;
  subtotal: number;
  currency: string;
  paymentPreference: DeliveryRequestBody["paymentPreference"];
  idempotentReplay: boolean;
  decisionReason: string | null;
  message: string;
};
export type DeliveryRequestDetails = DeliveryRequestReceipt & {
  customerNote: string | null;
  items: { name: string; quantity: number; unitPrice: number; lineTotal: number }[];
};
export type CustomerAddress = {
  addressId: string;
  label: string;
  address: string;
  reference: string | null;
  contactPhone: string;
  isDefault: boolean;
  version: number;
};
