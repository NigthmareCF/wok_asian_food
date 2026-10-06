import { NextRequest, NextResponse } from "next/server";
import { readAccessToken } from "@/modules/auth/server/auth-cookies";
import { isSameOrigin } from "@/modules/auth/server/request-origin";
import { isUuid } from "@/modules/checkout/pickup-contract";
type Options = {
  path: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  parse?: (v: unknown) => unknown;
  validate: (v: unknown) => boolean;
  idempotent?: boolean;
  requestId?: boolean;
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
            messages[response.status] ??
            "El servicio no está disponible o el resultado es incierto. Reintenta la misma solicitud para evitar duplicados.",
        },
        messages[response.status] ? response.status : 503,
      );
    }
    const body: unknown = await response.json();
    if (!options.validate(body)) throw new Error("Invalid upstream response");
    return reply(body, response.status);
  } catch {
    return reply(
      {
        message:
          "No pudimos confirmar el resultado. Reintenta la misma solicitud para evitar duplicados.",
      },
      503,
    );
  }
}
