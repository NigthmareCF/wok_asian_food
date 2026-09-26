import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const accessCookie = "wok_access";
const refreshCookie = "wok_refresh";
type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
};

export function getWokApiBaseUrl() {
  const value = process.env.WOK_API_BASE_URL?.trim().replace(/\/$/, "");
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
      return null;
    if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:")
      return null;
    return value;
  } catch {
    return null;
  }
}

export function sameOriginMutation(request: NextRequest) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  return origin === new URL(request.url).origin && fetchSite !== "cross-site";
}

export async function clearWokCookies() {
  const store = await cookies();
  store.set(accessCookie, "", cookieOptions(0));
  store.set(refreshCookie, "", cookieOptions(0));
}

export async function setWokCookies(tokens: TokenPair) {
  const store = await cookies();
  store.set(
    accessCookie,
    tokens.accessToken,
    cookieOptions(Math.min(Math.max(tokens.expiresInSeconds, 1), 900)),
  );
  store.set(refreshCookie, tokens.refreshToken, cookieOptions());
}

export async function fetchWithWokSession(
  path: string,
  init: RequestInit = {},
) {
  const baseUrl = getWokApiBaseUrl();
  if (!baseUrl) return new Response(null, { status: 503 });

  const store = await cookies();
  const refreshToken = store.get(refreshCookie)?.value;
  const accessToken = store.get(accessCookie)?.value;
  if (!accessToken && !refreshToken) return new Response(null, { status: 401 });
  if (accessToken) {
    try {
      const response = await send(baseUrl, path, init, accessToken);
      if (response.status !== 401 || !refreshToken) return response;
    } catch {
      return new Response(null, { status: 503 });
    }
  }

  if (!refreshToken) return new Response(null, { status: 401 });
  const refreshed = await rotateSession(baseUrl, refreshToken);
  if (!refreshed) {
    await clearWokCookies();
    return new Response(null, { status: 401 });
  }
  await setWokCookies(refreshed);
  try {
    return await send(baseUrl, path, init, refreshed.accessToken);
  } catch {
    return new Response(null, { status: 503 });
  }
}

function send(
  baseUrl: string,
  path: string,
  init: RequestInit,
  accessToken: string,
) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(8_000),
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

async function rotateSession(baseUrl: string, refreshToken: string) {
  try {
    const response = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    return response.ok ? ((await response.json()) as TokenPair) : null;
  } catch {
    return null;
  }
}

function cookieOptions(maxAge?: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    ...(maxAge === undefined ? {} : { maxAge }),
  };
}
