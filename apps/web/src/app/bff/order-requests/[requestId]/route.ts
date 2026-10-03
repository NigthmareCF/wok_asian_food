import { NextRequest, NextResponse } from "next/server";
import { readAccessToken } from "@/modules/auth/server/auth-cookies";
import { isSameOrigin } from "@/modules/auth/server/request-origin";
import { isUuid } from "@/modules/checkout/pickup-contract";
import { readOrCancelPickup } from "@/modules/client-order-tracking/server/pickup-requests";

type Context = { params: Promise<{ requestId: string }> };
const headers = { "Cache-Control": "no-store" };
async function forward(context: Context, method: "GET" | "DELETE") {
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
export async function GET(_request: NextRequest, context: Context) {
  return forward(context, "GET");
}
export async function DELETE(request: NextRequest, context: Context) {
  if (!request.headers.get("origin") || !isSameOrigin(request))
    return NextResponse.json(
      { message: "Origen no permitido." },
      { status: 403, headers },
    );
  return forward(context, "DELETE");
}
