import { NextRequest, NextResponse } from "next/server";
import { readAccessToken } from "@/modules/auth/server/auth-cookies";
import { isSameOrigin } from "@/modules/auth/server/request-origin";
import { isUuid } from "@/modules/checkout/pickup-contract";
import { loadCurrentUser } from "@/modules/auth/server/backend-auth";
import { checkExpectedClientPrincipal } from "@/modules/clients/server/expected-client-principal";
type Options = {
  path: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  parse?: (v: unknown) => unknown;
  validate: (v: unknown) => boolean;
  normalize?: (v: unknown) => unknown;
  idempotent?: boolean;
  requestId?: boolean;
  errorMessages?: Partial<Record<number, string>>;
  bindFinancialActor?: boolean;
  bindClientPrincipal?: boolean;
  emptyResponse?: boolean;
};
export async function endpoint(request: NextRequest, options: Options) {
  const reply = (body: unknown, status: number) =>
    NextResponse.json(body, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  if (
    options.method !== "GET" &&
    (!request.headers.get("origin") || !isSameOrigin(request))
  )
    return reply({ message: "Origen no permitido." }, 403);
  const token = await readAccessToken();
  if (!token)
    return reply(
      { message: "Tu sesión expiró. Inicia sesión nuevamente." },
      401,
    );
  const key = request.headers.get("Idempotency-Key");
  const requestId = request.headers.get("X-Request-Id");
  const payload = options.parse
    ? options.parse(await request.json().catch(() => null))
    : undefined;
  if (
    (options.parse && !payload) ||
    (options.idempotent && !isUuid(key)) ||
    (options.requestId && !isUuid(requestId))
  )
    return reply({ message: "Revisa los datos enviados." }, 400);
  try {
    if (options.bindClientPrincipal) {
      const principal = await checkExpectedClientPrincipal(token, request);
      if (!principal.ok) return reply(principal.body, principal.status);
    }
    if (options.bindFinancialActor) {
      const actor = request.headers.get("X-Financial-Actor");
      if (!isUuid(actor))
        return reply({ message: "Operador financiero inválido." }, 400);
      const user = await loadCurrentUser(token);
      if (user.userId !== actor)
        return reply(
          {
            message:
              "La sesión cambió. Este intento pertenece a otro operador.",
          },
          403,
        );
    }
    const base = (
      process.env.WOK_API_BASE_URL ?? "http://localhost:8080"
    ).replace(/\/$/, "");
    const response = await fetch(`${base}/api/v1/${options.path}`, {
      method: options.method,
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${token}`,
        ...(payload ? { "Content-Type": "application/json" } : {}),
        ...(options.idempotent ? { "Idempotency-Key": key! } : {}),
        ...(options.requestId ? { "X-Request-Id": requestId! } : {}),
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    if (!response.ok) {
      const messages: Record<number, string> = {
        400: "Revisa los datos enviados.",
        401: "Tu sesión expiró. Inicia sesión nuevamente.",
        403: "Tu cuenta no tiene permiso para esta acción.",
        404: "No encontramos este registro.",
        409: "El estado cambió o la clave ya se utilizó. Actualiza la información antes de continuar.",
        422: "Revisa los productos y el horario solicitado; deben permitir el tiempo de preparación.",
      };
      return reply(
        {
          message:
            (options.method === "GET" && !messages[response.status]
              ? "No pudimos consultar los datos. Intenta nuevamente."
              : undefined) ??
            options.errorMessages?.[response.status] ??
            messages[response.status] ??
            "El servicio no está disponible o el resultado es incierto. Reintenta la misma solicitud para evitar duplicados.",
        },
        messages[response.status] ? response.status : 503,
      );
    }
    if (options.emptyResponse) {
      if (response.status !== 204) throw new Error("Invalid empty response");
      return new NextResponse(null, {
        status: 204,
        headers: { "Cache-Control": "no-store" },
      });
    }
    const upstream: unknown = await response.json();
    const body = options.normalize ? options.normalize(upstream) : upstream;
    if (!options.validate(body)) throw new Error("Invalid upstream response");
    return reply(body, response.status);
  } catch (cause) {
    if (
      options.bindFinancialActor &&
      cause &&
      typeof cause === "object" &&
      "status" in cause &&
      (cause.status === 401 || cause.status === 403)
    )
      return reply(
        {
          message:
            cause.status === 401
              ? "Tu sesión expiró. El intento sigue pendiente."
              : "No tienes permiso para recuperar este intento.",
        },
        cause.status,
      );
    return reply(
      {
        message:
          options.method === "GET"
            ? "No pudimos consultar los datos. Intenta nuevamente."
            : "No pudimos confirmar el resultado. Reintenta la misma solicitud para evitar duplicados.",
      },
      503,
    );
  }
}
