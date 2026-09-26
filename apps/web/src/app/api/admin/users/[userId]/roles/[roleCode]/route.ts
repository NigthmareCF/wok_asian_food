import { NextRequest, NextResponse } from "next/server";
import {
  fetchWithWokSession,
  sameOriginMutation,
} from "@/shared/server/wok-backend";

export async function PUT(
  request: NextRequest,
  context: RouteContext<"/api/admin/users/[userId]/roles/[roleCode]">,
) {
  if (!sameOriginMutation(request))
    return NextResponse.json(
      { message: "Solicitud no permitida." },
      { status: 403 },
    );
  const { userId, roleCode } = await context.params;
  if (
    !/^[0-9a-f-]{36}$/i.test(userId) ||
    !["ADMIN", "OPERATIONAL"].includes(roleCode)
  )
    return NextResponse.json(
      { message: "Usuario o rol inválido." },
      { status: 400 },
    );
  let body: { action?: string; reason?: string; expectedVersion?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  }
  if (
    !["GRANT", "REVOKE"].includes(body.action ?? "") ||
    !body.reason?.trim() ||
    body.reason.trim().length > 500 ||
    !Number.isInteger(body.expectedVersion) ||
    (body.expectedVersion ?? 0) < 1
  )
    return NextResponse.json(
      { message: "Indica acción, motivo y versión actual del usuario." },
      { status: 400 },
    );
  const response = await fetchWithWokSession(
    `/api/v1/admin/users/${userId}/roles/${roleCode}`,
    {
      method: "PUT",
      body: JSON.stringify({ ...body, reason: body.reason.trim() }),
    },
  );
  if (!response.ok)
    return NextResponse.json(
      {
        message:
          response.status === 409
            ? "La cuenta cambió o la acción no es válida. Actualiza la lista."
            : "No se pudo guardar el cambio de rol.",
      },
      { status: response.status },
    );
  return NextResponse.json(await response.json(), {
    headers: { "Cache-Control": "no-store" },
  });
}
