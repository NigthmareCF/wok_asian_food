import { cookies } from "next/headers";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  REMEMBER_COOKIE,
} from "@/modules/auth/auth-constants";
import type { TokenPair } from "@/modules/auth/server/backend-auth";

const secure = process.env.WOK_COOKIE_SECURE === "true";

export async function storeAuthCookies(
  tokens: TokenPair,
  rememberSession: boolean,
) {
  const store = await cookies();
  store.set(ACCESS_COOKIE, tokens.accessToken, {
    httpOnly: true,
    maxAge: tokens.expiresInSeconds,
    path: "/",
    sameSite: "lax",
    secure,
  });
  store.set(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    ...(rememberSession ? { maxAge: 60 * 60 * 24 * 30 } : {}),
    path: "/bff/auth",
    sameSite: "strict",
    secure,
  });
  store.set(REMEMBER_COOKIE, rememberSession ? "true" : "false", {
    httpOnly: true,
    ...(rememberSession ? { maxAge: 60 * 60 * 24 * 30 } : {}),
    path: "/bff/auth",
    sameSite: "strict",
    secure,
  });
}

export async function readAccessToken() {
  return (await cookies()).get(ACCESS_COOKIE)?.value;
}

export async function clearAuthCookies() {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  for (const name of [REFRESH_COOKIE, REMEMBER_COOKIE])
    store.set(name, "", {
      maxAge: 0,
      path: "/bff/auth",
      httpOnly: true,
      sameSite: "strict",
      secure,
    });
}
