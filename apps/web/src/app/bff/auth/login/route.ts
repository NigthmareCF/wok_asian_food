import { NextRequest, NextResponse } from "next/server";
import { landingPathForRoles } from "@/modules/auth/auth-policy";
import { storeAuthCookies } from "@/modules/auth/server/auth-cookies";
import {
  BackendAuthError,
  loadCurrentUser,
  loginWithBackend,
} from "@/modules/auth/server/backend-auth";

function isSameOrigin(request: NextRequest) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none")
    return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { message: "Origen no permitido." },
      { status: 403 },
    );
  }

  let body: { email?: unknown; password?: unknown; rememberSession?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  }

  if (
    typeof body.email !== "string" ||
    typeof body.password !== "string" ||
    typeof body.rememberSession !== "boolean"
  ) {
    return NextResponse.json(
      { message: "Datos de acceso inválidos." },
      { status: 400 },
    );
  }

  try {
    const tokens = await loginWithBackend(body.email.trim(), body.password);
    const user = await loadCurrentUser(tokens.accessToken);
    await storeAuthCookies(tokens, body.rememberSession);
    return NextResponse.json({
      user,
      redirectTo: landingPathForRoles(user.roles),
    });
  } catch (error) {
    const authError = error instanceof BackendAuthError ? error : null;
    return NextResponse.json(
      { message: authError?.message ?? "No fue posible iniciar sesión." },
      { status: authError?.status ?? 500 },
    );
  }
}
