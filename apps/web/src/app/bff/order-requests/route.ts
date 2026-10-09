import { NextRequest, NextResponse } from "next/server";
import { readAccessToken } from "@/modules/auth/server/auth-cookies";
import { isSameOrigin } from "@/modules/auth/server/request-origin";
import { isUuid, parsePickupRequest } from "@/modules/checkout/pickup-contract";
import { submitPickup } from "@/modules/checkout/server/submit-pickup";
import { readOrCancelPickup } from "@/modules/client-order-tracking/server/pickup-requests";
import { checkExpectedClientPrincipal } from "@/modules/clients/server/expected-client-principal";

const headers = { "Cache-Control": "no-store" };
export async function GET(request: NextRequest) {
  const token = await readAccessToken();
  if (!token)
    return NextResponse.json(
      { message: "Inicia sesión para consultar tus solicitudes." },
      { status: 401, headers },
    );
  try {
    const principal = await checkExpectedClientPrincipal(token, request);
    if (!principal.ok)
      return NextResponse.json(principal.body, {
        status: principal.status,
        headers,
      });
    const result = await readOrCancelPickup(token);
    return NextResponse.json(result.body, { status: result.status, headers });
  } catch {
    return NextResponse.json(
      { message: "No pudimos consultar tus solicitudes. Intenta nuevamente." },
      { status: 503, headers },
    );
  }
}
export async function POST(request: NextRequest) {
  if (!request.headers.get("origin") || !isSameOrigin(request))
    return NextResponse.json(
      { message: "Origen no permitido." },
      { status: 403, headers },
    );
  const token = await readAccessToken();
  if (!token)
    return NextResponse.json(
      { message: "Inicia sesión para enviar tu solicitud." },
      { status: 401, headers },
    );
  const key = request.headers.get("Idempotency-Key");
  const payload = parsePickupRequest(await request.json().catch(() => null));
  if (!isUuid(key) || !payload)
    return NextResponse.json(
      { message: "Revisa los datos de la solicitud." },
      { status: 400, headers },
    );
  try {
    const principal = await checkExpectedClientPrincipal(token, request);
    if (!principal.ok)
      return NextResponse.json(principal.body, {
        status: principal.status,
        headers,
      });
    const result = await submitPickup(token, key, payload);
    return NextResponse.json(result.body, { status: result.status, headers });
  } catch {
    return NextResponse.json(
      {
        message:
          "No pudimos confirmar el resultado. Reintenta la misma solicitud para evitar duplicados.",
      },
      { status: 503, headers },
    );
  }
}
