import { createApiRequest } from "./api-client";
export { ApiError } from "./api-client";

export const apiRequest = createApiRequest(
  process.env.EXPO_PUBLIC_API_BASE_URL,
  __DEV__,
);

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
};
export type ClientProfile = {
  userId: string;
  email: string;
  displayName: string;
  phone?: string | null;
  version: number;
};
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
  decision:
    | "ACCEPT"
    | "ACCEPT_WITH_CONDITIONS"
    | "SUGGEST_OTHER_TIME"
    | "REQUIRES_HUMAN_APPROVAL"
    | "REJECT";
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
  message: string;
};
export type PickupRequestState = PickupRequestReceipt;
export type PickupTracking = {
  requestId: string;
  requestStatus: PickupRequestReceipt["status"];
  orderStatus?: string | null;
  estimatedReadyAt?: string | null;
  asOf: string;
};
export type PickupRequestDetails = PickupRequestState & {
  customerNote: string | null;
  items: {
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    currencyId: string;
  }[];
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
  message: string;
};
export type DeliveryRequestDetails = DeliveryRequestReceipt & {
  customerNote: string | null;
  items: {
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
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
