import type { AuthenticatedUser } from "@/modules/auth/auth-types";

type TokenPair = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresInSeconds: number;
};

export class BackendAuthError extends Error {
  constructor(
    public readonly status: number,
    message = "No fue posible completar la autenticación.",
  ) {
    super(message);
  }
}

function apiBaseUrl() {
  return (process.env.WOK_API_BASE_URL ?? "http://localhost:8080").replace(
    /\/$/,
    "",
  );
}

async function authRequest<Response>(path: string, init: RequestInit) {
  let response: globalThis.Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new BackendAuthError(
      503,
      "El servicio de acceso no está disponible.",
    );
  }

  if (!response.ok) {
    const message =
      response.status === 401
        ? "Correo o contraseña incorrectos."
        : response.status === 403
          ? "Tu cuenta no tiene acceso a este canal."
          : "No fue posible completar la autenticación.";
    throw new BackendAuthError(response.status, message);
  }

  return (await response.json()) as Response;
}

export function loginWithBackend(email: string, password: string) {
  return authRequest<TokenPair>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, clientType: "WEB" }),
  });
}

export async function sendPublicAuthRequest(
  path: string,
  body: Record<string, string>,
) {
  let response: globalThis.Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new BackendAuthError(
      503,
      "El servicio de acceso no está disponible.",
    );
  }
  const result = (await response.json().catch(() => null)) as {
    message?: string;
  } | null;
  if (!response.ok) {
    throw new BackendAuthError(
      response.status,
      response.status >= 500
        ? "No fue posible completar la solicitud. Intenta más tarde."
        : (result?.message ?? "No fue posible completar la solicitud."),
    );
  }
  return { message: result?.message ?? "Solicitud recibida." };
}

export function loadCurrentUser(accessToken: string) {
  return authRequest<AuthenticatedUser>("/api/v1/auth/me", {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function refreshWithBackend(refreshToken: string) {
  return authRequest<TokenPair>("/api/v1/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
}

export async function logoutFromBackend(accessToken: string) {
  try {
    await fetch(`${apiBaseUrl()}/api/v1/auth/logout`, {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // Local cookies are still removed when the API is temporarily unavailable.
  }
}

export type { TokenPair };
