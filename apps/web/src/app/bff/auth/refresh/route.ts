import { NextRequest, NextResponse } from "next/server";
import { REFRESH_COOKIE, REMEMBER_COOKIE } from "@/modules/auth/auth-constants";
import { postLoginDestination } from "@/modules/auth/auth-policy";
import {
  clearAuthCookies,
  storeAuthCookies,
} from "@/modules/auth/server/auth-cookies";
import { currentSession } from "@/modules/auth/server/auth-session";
import {
  BackendAuthError,
  loadCurrentUser,
  refreshWithBackend,
} from "@/modules/auth/server/backend-auth";
import { isSameOrigin } from "@/modules/auth/server/request-origin";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request))
    return NextResponse.json(
      { message: "Origen no permitido." },
      { status: 403 },
    );
  const next = request.nextUrl.searchParams.get("next");
  try {
    const activeUser = await currentSession();
    if (activeUser)
      return NextResponse.json({
        redirectTo: postLoginDestination(next, activeUser.roles),
      });
    const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
    if (!refreshToken)
      return NextResponse.json({ message: "Sin sesión." }, { status: 401 });
    const tokens = await refreshWithBackend(refreshToken);
    const user = await loadCurrentUser(tokens.accessToken);
    await storeAuthCookies(
      tokens,
      request.cookies.get(REMEMBER_COOKIE)?.value === "true",
    );
    return NextResponse.json({
      redirectTo: postLoginDestination(next, user.roles),
    });
  } catch (error) {
    const authError = error instanceof BackendAuthError ? error : null;
    if (authError?.status === 401 || authError?.status === 403)
      await clearAuthCookies();
    return NextResponse.json(
      { message: authError?.message ?? "No fue posible renovar la sesión." },
      { status: authError?.status ?? 500 },
    );
  }
}
