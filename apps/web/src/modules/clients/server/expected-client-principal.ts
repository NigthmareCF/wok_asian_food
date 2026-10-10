import {
  BackendAuthError,
  loadCurrentUser,
} from "@/modules/auth/server/backend-auth";
import { isUuid } from "@/modules/checkout/pickup-contract";

type PrincipalCheck =
  | { ok: true }
  | { ok: false; status: number; body: { message: string; code?: string } };

// El principal esperado es una precondición de identidad, no autorización.
// El llamador conserva este mismo token para el reenvío; no se lee otra cookie.
export async function checkExpectedClientPrincipal(
  token: string,
  request: Request,
): Promise<PrincipalCheck> {
  const expected = request.headers.get("X-Wok-Expected-Principal");
  if (expected === null)
    return {
      ok: false,
      status: 409,
      body: {
        message:
          "Actualiza esta pestaña para continuar. No cierres la pestaña ni borres sus datos. Después, reintenta la misma solicitud.",
        code: "CLIENT_UPDATE_REQUIRED",
      },
    };
  if (!isUuid(expected))
    return {
      ok: false,
      status: 400,
      body: { message: "Verifica tu sesión y vuelve a abrir esta pantalla." },
    };
  try {
    const user = await loadCurrentUser(token);
    if (
      !user ||
      !isUuid(user.userId) ||
      typeof user.email !== "string" ||
      typeof user.displayName !== "string" ||
      user.status !== "ACTIVE" ||
      !Array.isArray(user.roles) ||
      !user.roles.every((role) => typeof role === "string") ||
      !Array.isArray(user.permissions) ||
      !user.permissions.every((permission) => typeof permission === "string")
    )
      throw new Error("Invalid current user");
    if (user.userId.toLowerCase() !== expected.toLowerCase())
      return {
        ok: false,
        status: 409,
        body: {
          message: "La sesión cambió. Verifica tu cuenta antes de continuar.",
          code: "CLIENT_PRINCIPAL_CHANGED",
        },
      };
    return { ok: true };
  } catch (error) {
    if (
      error instanceof BackendAuthError &&
      (error.status === 401 || error.status === 403)
    )
      return {
        ok: false,
        status: error.status,
        body: {
          message:
            error.status === 401
              ? "Tu sesión expiró. Inicia sesión nuevamente."
              : "No pudimos verificar el acceso de tu cuenta.",
        },
      };
    return {
      ok: false,
      status: 503,
      body: {
        message: "No pudimos verificar tu sesión. Intenta nuevamente.",
        code: "CLIENT_PRINCIPAL_UNVERIFIED",
      },
    };
  }
}
