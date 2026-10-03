import { type PickupRequest, isPickupReceipt } from "../pickup-contract";

export async function submitPickup(
  token: string,
  key: string,
  payload: PickupRequest,
) {
  const base = (
    process.env.WOK_API_BASE_URL ?? "http://localhost:8080"
  ).replace(/\/$/, "");
  const response = await fetch(`${base}/api/v1/client/order-requests`, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": key,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const messages: Record<number, string> = {
      400: "Revisa los productos, cantidades y horario enviados.",
      401: "Tu sesión expiró. Inicia sesión nuevamente para reintentar.",
      403: "Esta solicitud requiere una cuenta Cliente.",
      409: "La clave de solicitud ya se utilizó con otros datos. Revisa tus solicitudes antes de intentar otra vez.",
      422: "Revisa el catálogo, la moneda y el tiempo de preparación del horario solicitado.",
    };
    return {
      status: messages[response.status] ? response.status : 503,
      body: {
        message:
          messages[response.status] ??
          "No pudimos confirmar el resultado. Reintenta la misma solicitud para evitar duplicados.",
      },
    };
  }
  const receipt: unknown = await response.json();
  if (!isPickupReceipt(receipt)) throw new Error("Invalid pickup receipt");
  return { status: 202, body: receipt };
}
