import {
  isPickupCancellation,
  isPickupDetails,
  isPickupHistory,
} from "../pickup-details";

export async function readOrCancelPickup(
  token: string,
  requestId?: string,
  method: "GET" | "DELETE" = "GET",
) {
  const base = (
    process.env.WOK_API_BASE_URL ?? "http://localhost:8080"
  ).replace(/\/$/, "");
  const response = await fetch(
    `${base}/api/v1/client/order-requests${requestId ? `/${requestId}` : ""}`,
    {
      method,
      cache: "no-store",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: "Tu sesión expiró. Inicia sesión nuevamente.",
      403: "Esta sección requiere una cuenta Cliente.",
      404: "No encontramos esa solicitud en tu cuenta.",
      409: "La solicitud cambió de estado y ya no se puede cancelar. Actualiza su detalle.",
    };
    return {
      status: messages[response.status] ? response.status : 503,
      body: {
        message:
          messages[response.status] ??
          "No pudimos completar la consulta. Actualiza el estado antes de reintentar.",
      },
    };
  }
  const data: unknown = await response.json();
  const valid =
    method === "DELETE"
      ? isPickupCancellation(data) && data.requestId === requestId
      : requestId
        ? isPickupDetails(data) && data.requestId === requestId
        : isPickupHistory(data);
  if (!valid) throw new Error("Invalid pickup response");
  return { status: 200, body: data };
}
