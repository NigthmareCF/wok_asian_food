import { notFound } from "next/navigation";
import { currentSession } from "@/modules/auth/server/auth-session";
import { NextRequest, NextResponse } from "next/server";
import { readAccessToken } from "@/modules/auth/server/auth-cookies";
import { loadCurrentUser } from "@/modules/auth/server/backend-auth";
import { isSameOrigin } from "@/modules/auth/server/request-origin";
import { isUuid } from "@/modules/checkout/pickup-contract";
import { object } from "../live-contract";
import {
  isDurableAttempt,
  isResolutionReview,
  isAttemptHistory,
  isPreparationContext,
  isResolutionQueue,
  parsePreparation,
  parseVersion,
  parseRetirement,
  parseReplacement,
  parseResolution,
  matchesPreparation,
} from "../attempt-contract";
export type AttemptOperation =
  | "history"
  | "prepare"
  | "context"
  | "legacy"
  | "get"
  | "capture"
  | "retire"
  | "replacement"
  | "review"
  | "resolve"
  | "queue";
const errors: Record<number, string> = {
  400: "Revisa los datos enviados.",
  401: "Tu sesión expiró. Los intentos del servidor se conservan.",
  403: "Los permisos cambiaron o esta operación pertenece a otro operador.",
  404: "No encontramos el registro. Esto no demuestra ausencia de captura.",
  409: "El estado o la versión cambió. Consulta antes de continuar.",
  422: "Revisa el importe y los requisitos. Consulta el resultado durable.",
};
export async function attemptEndpoint(
  request: NextRequest,
  operation: AttemptOperation,
  params: { accountId?: string; attemptId?: string; key?: string } = {},
) {
  const reply = (body: unknown, status: number) =>
    NextResponse.json(body, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  const post = [
      "prepare",
      "capture",
      "retire",
      "replacement",
      "resolve",
    ].includes(operation),
    exceptional = ["review", "resolve", "queue"].includes(operation);
  if (post && (!request.headers.get("origin") || !isSameOrigin(request)))
    return reply({ message: "Origen no permitido." }, 403);
  if (Object.values(params).some((p) => !isUuid(p)))
    return reply({ message: "Identificador inválido." }, 400);
  const query = request.nextUrl.searchParams,
    cursor = query.get("cursor"),
    accountFilter = query.get("accountId");
  if (
    [...query.keys()].some(
      (k) =>
        !(
          operation === "queue"
            ? ["cursor", "accountId"]
            : operation === "history"
              ? ["cursor"]
              : []
        ).includes(k),
    ) ||
    (accountFilter != null && !isUuid(accountFilter)) ||
    (cursor != null &&
      !(operation === "queue"
        ? cursor.startsWith("resolution:") && isUuid(cursor.slice(11))
        : isUuid(cursor)))
  )
    return reply({ message: "Filtro o cursor inválido." }, 400);
  if (request.headers.has("Idempotency-Key"))
    return reply(
      { message: "La identidad de estos intentos la controla el servidor." },
      400,
    );
  const requestId = request.headers.get("X-Request-Id"),
    actor = request.headers.get("X-Financial-Actor");
  if (!isUuid(actor) || (post && !isUuid(requestId)))
    return reply(
      { message: "Operador o referencia de petición inválidos." },
      400,
    );
  const parsers = {
    prepare: parsePreparation,
    capture: parseVersion,
    retire: parseRetirement,
    replacement: parseReplacement,
    resolve: parseResolution,
  };
  const parser = parsers[operation as keyof typeof parsers],
    payload = post ? parser(await request.json().catch(() => null)) : undefined;
  if (post && !payload)
    return reply(
      {
        message: "Revisa el contenido explícito, versión, motivo y evidencia.",
      },
      400,
    );
  try {
    const token = await readAccessToken();
    if (!token) return reply({ message: errors[401] }, 401);
    const user = await loadCurrentUser(token);
    if (
      user.userId !== actor ||
      !Array.isArray(user.permissions) ||
      !user.permissions.includes("payments:manage") ||
      (exceptional && !user.permissions.includes("payments:resolve"))
    )
      return reply({ message: errors[403] }, 403);
    const account = params.accountId,
      attempt = params.attemptId;
    let path =
      operation === "queue"
        ? "payment-attempt-resolutions"
        : account
          ? "accounts/" + account + "/payment-attempts"
          : "payment-attempts";
    if (operation === "context") path += "/context";
    else if (operation === "legacy") path += "/by-legacy-key/" + params.key;
    else if (attempt)
      path +=
        "/" +
        attempt +
        (["review", "resolve"].includes(operation)
          ? "/resolution"
          : operation === "get"
            ? ""
            : "/" + operation);
    const search = new URLSearchParams();
    if (cursor) search.set("cursor", cursor);
    if (accountFilter) search.set("accountId", accountFilter);
    const base = (
      process.env.WOK_API_BASE_URL ?? "http://localhost:8080"
    ).replace(/\/$/, "");
    const response = await fetch(
      base + "/api/v1/operational/" + path + (search.size ? "?" + search : ""),
      {
        method: post ? "POST" : "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
        headers: {
          Authorization: "Bearer " + token,
          ...(post
            ? { "Content-Type": "application/json", "X-Request-Id": requestId! }
            : {}),
        },
        ...(post ? { body: JSON.stringify(payload) } : {}),
      },
    );
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok)
      return reply(
        {
          message:
            errors[response.status] ??
            "Resultado incierto. Consulta el intento original; no prepares otro por este error.",
          ...(object(body) &&
          typeof body.code === "string" &&
          /^[A-Z_]{1,80}$/.test(body.code)
            ? { code: body.code }
            : {}),
        },
        [400, 401, 403, 404, 409, 422].includes(response.status)
          ? response.status
          : 503,
      );
    let valid = false;
    if (operation === "history")
      valid =
        isAttemptHistory(body) &&
        (!account || body.items.every((i) => i.accountId === account));
    else if (operation === "context")
      valid = isPreparationContext(body) && body.accountId === account;
    else if (operation === "queue")
      valid =
        isResolutionQueue(body) &&
        (!accountFilter ||
          body.items.every((i) => i.accountId === accountFilter));
    else if (exceptional)
      valid =
        isResolutionReview(body) &&
        body.attempt.accountId === account &&
        body.attempt.attemptId === attempt &&
        (operation !== "resolve" ||
          (body.ownerUserId !== actor &&
            body.attempt.status === "RETIRED" &&
            body.attempt.resolution?.actorId === actor));
    else
      valid =
        isDurableAttempt(body) &&
        body.accountId === account &&
        (!attempt ||
          (operation === "replacement"
            ? body.previousAttemptId === attempt
            : body.attemptId === attempt));
    const expected =
      operation === "prepare"
        ? parsePreparation(payload)
        : operation === "replacement"
          ? parseReplacement(payload)?.payment
          : null;
    if (valid && expected && isDurableAttempt(body))
      valid = matchesPreparation(body, expected);
    if (!valid)
      return reply(
        {
          message:
            "Respuesta durable inválida. Consulta el registro original; no se autoriza otra captura.",
        },
        503,
      );
    return reply(body, response.status);
  } catch (cause) {
    const status =
      object(cause) && (cause.status === 401 || cause.status === 403)
        ? cause.status
        : 503;
    return reply(
      {
        message:
          errors[status] ??
          "Resultado incierto. Consulta el servidor; no cambies la identidad del intento.",
      },
      status,
    );
  }
}

// Las páginas ADMIN verifican sesión y permisos en servidor antes de renderizar.
export async function authorizeAdministrativePaymentPage(target?: {
  accountId: unknown;
  search: Record<string, string | string[] | undefined>;
}) {
  const user = await currentSession();
  if (
    !user ||
    !user.roles.includes("ADMIN") ||
    !["payments:manage", "payments:resolve"].every((p) =>
      user.permissions.includes(p),
    )
  )
    notFound();
  if (
    target &&
    (!isUuid(target.accountId) ||
      Object.keys(target.search).some((k) => k !== "reviewAttempt") ||
      !isUuid(target.search.reviewAttempt))
  )
    notFound();
  const token = await readAccessToken();
  if (!token) notFound();
  const base = (
    process.env.WOK_API_BASE_URL ?? "http://localhost:8080"
  ).replace(/\/$/, "");
  const endpoint = target
    ? "/accounts/" +
      target.accountId +
      "/payment-attempts/" +
      target.search.reviewAttempt +
      "/resolution"
    : "/payment-attempt-resolutions";
  const response = await fetch(base + "/api/v1/operational" + endpoint, {
    cache: "no-store",
    headers: { Accept: "application/json", Authorization: "Bearer " + token },
    signal: AbortSignal.timeout(8000),
  });
  if ([401, 403, 404].includes(response.status)) notFound();
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw Error("Consulta administrativa no disponible; no autoriza resolver.");
  if (target) {
    if (
      !isResolutionReview(body) ||
      body.attempt.accountId !== target.accountId ||
      body.attempt.attemptId !== target.search.reviewAttempt
    )
      notFound();
  } else if (!isResolutionQueue(body))
    throw Error("Consulta administrativa inválida; no autoriza resolver.");
  return user;
}
