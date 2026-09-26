import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  fetchWithWokSession,
  sameOriginMutation,
} from "@/shared/server/wok-backend";

const capabilityCodes = new Set([
  "LOCAL",
  "RESERVATIONS",
  "DINE_IN_ONLINE",
  "PICKUP",
  "DELIVERY",
  "ONLINE_ORDERS",
  "MESSAGING",
  "ONLINE_PAYMENTS",
  "PRODUCTION",
]);
const statuses = new Set([
  "ENABLED",
  "MANUAL_APPROVAL",
  "PAUSED",
  "DISABLED",
]);

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  if (!sameOriginMutation(request))
    return NextResponse.json(
      { message: "Solicitud no permitida." },
      { status: 403 },
    );
  const { code } = await context.params;
  if (!capabilityCodes.has(code))
    return NextResponse.json(
      { message: "Servicio desconocido." },
      { status: 404 },
    );

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  }
  if (!parsed || typeof parsed !== "object")
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  const body = parsed as {
    status?: string;
    reason?: string;
    expectedVersion?: number;
  };
  if (
    !statuses.has(body.status ?? "") ||
    !body.reason?.trim() ||
    body.reason.trim().length < 3 ||
    body.reason.trim().length > 500 ||
    !Number.isInteger(body.expectedVersion) ||
    (body.expectedVersion ?? 0) < 1
  )
    return NextResponse.json(
      { message: "Indica estado, motivo y versión actual del servicio." },
      { status: 400 },
    );

  const response = await fetchWithWokSession(
    `/api/v1/admin/service-capabilities/${code}`,
    {
      method: "PUT",
      headers: { "X-Request-Id": randomUUID() },
      body: JSON.stringify({
        status: body.status,
        reason: body.reason.trim(),
        expectedVersion: body.expectedVersion,
      }),
    },
  );
  if (!response.ok)
    return NextResponse.json(
      {
        message:
          response.status === 409
            ? "El servicio cambió desde que abriste esta pantalla. Actualiza la lista antes de reintentar."
            : response.status === 401
              ? "Tu sesión venció. Vuelve a iniciar sesión."
              : response.status === 403
                ? "Tu cuenta no tiene permiso para administrar los servicios."
                : "No se pudo guardar el cambio de servicio.",
      },
      { status: response.status },
    );
  return NextResponse.json(await response.json(), {
    headers: { "Cache-Control": "no-store" },
  });
}
