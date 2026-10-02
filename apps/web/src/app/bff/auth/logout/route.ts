import { NextRequest, NextResponse } from "next/server";
import {
  clearAuthCookies,
  readAccessToken,
} from "@/modules/auth/server/auth-cookies";
import { logoutFromBackend } from "@/modules/auth/server/backend-auth";
import { isSameOrigin } from "@/modules/auth/server/request-origin";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { message: "Origen no permitido." },
      { status: 403 },
    );
  }
  const accessToken = await readAccessToken();
  if (accessToken) await logoutFromBackend(accessToken);
  await clearAuthCookies();
  return NextResponse.json({ success: true });
}
