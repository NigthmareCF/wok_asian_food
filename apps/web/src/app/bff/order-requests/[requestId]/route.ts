import { NextRequest, NextResponse } from "next/server";
import { readAccessToken } from "@/modules/auth/server/auth-cookies";
import { isSameOrigin } from "@/modules/auth/server/request-origin";
import { isUuid } from "@/modules/checkout/pickup-contract";
import { readOrCancelPickup } from "@/modules/client-order-tracking/server/pickup-requests";
import { checkExpectedClientPrincipal } from "@/modules/clients/server/expected-client-principal";

type Context = { params: Promise<{ requestId: string }> };
const headers = { "Cache-Control": "no-store" };
async function forward(
  request: NextRequest,
  context: Context,
  method: "GET" | "DELETE",
) {
  const token = await readAccessToken();
  if (!token)
    return NextResponse.json(
      { message: "Inicia sesión para consultar tus solicitudes." },
      { status: 401, headers },
    );
  const { requestId } = await context.params;
  if (!isUuid(requestId))
    return NextResponse.json(
      { message: "No encontramos esa solicitud." },
      { status: 404, headers },
    );
  try {
    const principal = await checkExpectedClientPrincipal(token, request);
    if (!principal.ok)
      return NextResponse.json(principal.body, {
        status: principal.status,
        headers,
      });
    const result = await readOrCancelPickup(token, requestId, method);
    return NextResponse.json(result.body, { status: result.status, headers });
  } catch {
    return NextResponse.json(
      {
        message:
          "No pudimos confirmar el resultado. Actualiza el estado antes de reintentar.",
      },
      { status: 503, headers },
    );
  }
}
export async function GET(request: NextRequest, context: Context) {
  return forward(request, context, "GET");
}
export async function DELETE(request: NextRequest, context: Context) {
  if (!request.headers.get("origin") || !isSameOrigin(request))
    return NextResponse.json(
      { message: "Origen no permitido." },
      { status: 403, headers },
    );
  return forward(request, context, "DELETE");
}
