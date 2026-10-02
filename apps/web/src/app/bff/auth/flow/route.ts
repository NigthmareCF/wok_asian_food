import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/modules/auth/server/request-origin";
import {
  BackendAuthError,
  sendPublicAuthRequest,
} from "@/modules/auth/server/backend-auth";

const flows = {
  register: {
    path: "/api/v1/auth/register",
    fields: ["email", "displayName", "password"],
  },
  verify: { path: "/api/v1/auth/verify", fields: ["email", "code"] },
  resend: { path: "/api/v1/auth/verify/resend", fields: ["email"] },
  requestReset: { path: "/api/v1/auth/reset/request", fields: ["email"] },
  completeReset: {
    path: "/api/v1/auth/reset/complete",
    fields: ["email", "code", "newPassword"],
  },
} as const;

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request))
    return NextResponse.json(
      { message: "Origen no permitido." },
      { status: 403 },
    );

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  }
  const action = input?.action;
  if (typeof action !== "string" || !Object.hasOwn(flows, action))
    return NextResponse.json({ message: "Acción inválida." }, { status: 400 });
  const flow = flows[action as keyof typeof flows];
  const payload: Record<string, string> = {};
  for (const field of flow.fields) {
    const value = input[field];
    if (typeof value !== "string" || value.length > 256 || !value.trim())
      return NextResponse.json(
        { message: "Revisa los datos ingresados." },
        { status: 400 },
      );
    payload[field] =
      field === "password" || field === "newPassword" ? value : value.trim();
  }
  try {
    const result = await sendPublicAuthRequest(flow.path, payload);
    return NextResponse.json(result);
  } catch (error) {
    const authError = error instanceof BackendAuthError ? error : null;
    return NextResponse.json(
      {
        message: authError?.message ?? "No fue posible completar la solicitud.",
      },
      { status: authError?.status ?? 500 },
    );
  }
}
