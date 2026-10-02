import { NextRequest, NextResponse } from "next/server";
import {
  clearAuthCookies,
  readAccessToken,
} from "@/modules/auth/server/auth-cookies";
import { logoutFromBackend } from "@/modules/auth/server/backend-auth";

export async function POST(request: NextRequest) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return NextResponse.json(
      { message: "Origen no permitido." },
      { status: 403 },
    );
  }
  const origin = request.headers.get("origin");
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin) {
    try {
      if (new URL(origin).host !== host) {
        return NextResponse.json(
          { message: "Origen no permitido." },
          { status: 403 },
        );
      }
    } catch {
      return NextResponse.json(
        { message: "Origen no permitido." },
        { status: 403 },
      );
    }
  }
  const accessToken = await readAccessToken();
  if (accessToken) await logoutFromBackend(accessToken);
  await clearAuthCookies();
  return NextResponse.json({ success: true });
}
