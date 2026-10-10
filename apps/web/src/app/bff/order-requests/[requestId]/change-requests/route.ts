import { NextRequest, NextResponse } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isUuid } from "@/modules/checkout/pickup-contract";
import {
  isOrderChange,
  isOptionalOrderChange,
  parseCancellation,
} from "@/modules/client-order-tracking/change-contract";
type Context = { params: Promise<{ requestId: string }> };
export async function GET(request: NextRequest, context: Context) {
  const { requestId } = await context.params;
  if (!isUuid(requestId))
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  const response = await endpoint(request, {
    path: `client/order-requests/${requestId}/change-requests/current`,
    method: "GET",
    bindClientPrincipal: true,
    validate: (value) =>
      isOptionalOrderChange(value) &&
      (value === null || value.orderRequestId === requestId),
  });
  // La consulta específica distingue ausencia de historial de fallos de transporte.
  return response.status === 404
    ? NextResponse.json(null, { headers: { "Cache-Control": "no-store" } })
    : response;
}
export async function POST(request: NextRequest, context: Context) {
  const { requestId } = await context.params;
  if (!isUuid(requestId))
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  return endpoint(request, {
    path: `client/order-requests/${requestId}/change-requests`,
    method: "POST",
    bindClientPrincipal: true,
    idempotent: true,
    parse: parseCancellation,
    validate: (value) =>
      isOrderChange(value) && value.orderRequestId === requestId,
    errorMessages: {
      409: "El pedido cambió o ya tiene una solicitud pendiente. Actualiza el estado.",
      422: "La cancelación requiere atención directa del equipo.",
    },
  });
}
