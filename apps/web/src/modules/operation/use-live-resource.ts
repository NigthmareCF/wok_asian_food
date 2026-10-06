"use client";
import { useCallback, useEffect, useState } from "react";

class ResourceError extends Error {}

export function useLiveResource<T>(
  url: string,
  validate: (v: unknown) => v is T,
  poll = false,
) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    url: string;
    data: T | null;
    error: string;
  }>({ url, data: null, error: "" });
  const reload = useCallback(() => {
    setResult({ url, data: null, error: "" });
    setRevision((v) => v + 1);
  }, [url]);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body: unknown = await response.json();
        if (!response.ok)
          throw new ResourceError(
            response.status === 404
              ? "No encontramos este registro (404)."
              : response.status === 401
                ? "Tu sesión expiró. Inicia sesión nuevamente."
                : response.status === 403
                  ? "Tu cuenta no tiene permiso para esta acción."
                  : "No pudimos cargar los datos. Intenta actualizar.",
          );
        if (!validate(body))
          throw new ResourceError("El servicio devolvió datos inválidos.");
        if (!controller.signal.aborted)
          setResult({ url, data: body, error: "" });
      } catch (e) {
        if (!controller.signal.aborted)
          setResult({
            url,
            data: null,
            error:
              e instanceof ResourceError
                ? e.message
                : "No pudimos cargar los datos. Intenta actualizar.",
          });
      }
    }
    void load();
    return () => controller.abort();
  }, [url, validate, revision]);
  useEffect(() => {
    if (!poll) return;
    const timer = window.setInterval(() => setRevision((v) => v + 1), 15000);
    return () => window.clearInterval(timer);
  }, [poll]);
  return {
    data: result.url === url ? result.data : null,
    error: result.url === url ? result.error : "",
    reload,
  };
}
