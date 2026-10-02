import { NextRequest, NextResponse } from "next/server";
import { postLoginDestination } from "@/modules/auth/auth-policy";
import { storeAuthCookies } from "@/modules/auth/server/auth-cookies";
import { isSameOrigin } from "@/modules/auth/server/request-origin";
import {
  BackendAuthError,
  loadCurrentUser,
  loginWithBackend,
} from "@/modules/auth/server/backend-auth";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { message: "Origen no permitido." },
      { status: 403 },
    );
  }

  let body: {
    email?: unknown;
    password?: unknown;
    rememberSession?: unknown;
    next?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  }

  if (
    !body ||
    typeof body.email !== "string" ||
    typeof body.password !== "string" ||
    typeof body.rememberSession !== "boolean" ||
    (body.next !== null &&
      body.next !== undefined &&
      (typeof body.next !== "string" || body.next.length > 2048))
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
      redirectTo: postLoginDestination(
        typeof body.next === "string" ? body.next : null,
        user.roles,
      ),
    });
  } catch (error) {
    const authError = error instanceof BackendAuthError ? error : null;
    return NextResponse.json(
      { message: authError?.message ?? "No fue posible iniciar sesión." },
      { status: authError?.status ?? 500 },
    );
  }
}
