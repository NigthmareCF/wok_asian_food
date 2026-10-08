export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const messages: Record<number, string> = {
  400: "Revisa los datos de la solicitud.",
  401: "La sesión no es válida. Inicia sesión nuevamente.",
  403: "Tu cuenta no tiene permiso para esta acción.",
  404: "La información solicitada ya no está disponible.",
  409: "La información cambió. Actualiza los datos antes de volver a guardar.",
  422: "El restaurante no puede aceptar esta solicitud en ese horario.",
  429: "Has realizado varios intentos. Espera un momento antes de reintentar.",
  503: "No pudimos confirmar el resultado con el servidor. Reintenta la misma solicitud.",
};

export function createApiRequest(
  baseUrl: string | undefined,
  development: boolean,
  transport: typeof fetch = fetch,
) {
  return async function request<T>(
    path: string,
    options: RequestInit = {},
    accessToken?: string,
  ): Promise<T> {
    if (!baseUrl) {
      if (development)
        console.warn(
          "[mobile API] EXPO_PUBLIC_API_BASE_URL is missing; configure the mobile BFF origin.",
        );
      throw new ApiError("No pudimos cargar el menú, intenta de nuevo.");
    }
    let origin: string;
    try {
      const url = new URL(baseUrl);
      if (
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== "/" ||
        !(
          url.protocol === "https:" ||
          (development && url.protocol === "http:")
        )
      )
        throw new Error();
      origin = url.origin;
    } catch {
      if (development)
        console.warn(
          "[mobile API] Invalid BFF origin; use an origin-only URL and HTTPS outside development.",
        );
      throw new ApiError(
        "No pudimos conectar con el restaurante. Intenta de nuevo.",
      );
    }
    if (!/^\/api\/v1\/[a-zA-Z0-9/-]+$/.test(path))
      throw new ApiError("La ruta solicitada no es válida.");
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timeout = setTimeout(abort, 15_000);
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    try {
      const headers = new Headers(options.headers);
      headers.set("Content-Type", "application/json");
      if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
      else headers.delete("Authorization");
      const response = await transport(`${origin}${path}`, {
        ...options,
        headers,
        signal: controller.signal,
        credentials: "omit",
        redirect: "error",
      });
      if (!response.ok)
        throw new ApiError(
          messages[response.status] ?? "No se pudo completar la solicitud.",
          response.status,
        );
      if (response.status === 204) return undefined as T;
      try {
        return (await response.json()) as T;
      } catch {
        throw new ApiError(
          "El servidor no devolvió una respuesta válida.",
          503,
        );
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        "No pudimos confirmar el resultado. Comprueba tu conexión y reintenta la misma solicitud.",
      );
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
    }
  };
}
