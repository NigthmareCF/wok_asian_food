import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE } from "@/modules/auth/auth-constants";

export function proxy(request: NextRequest) {
  if (request.cookies.has(ACCESS_COOKIE)) return NextResponse.next();

  const login = new URL("/login", request.url);
  login.searchParams.set(
    "next",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/admin/:path*", "/client/:path*", "/operation/:path*"],
};
