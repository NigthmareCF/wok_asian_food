"use client";
import { useEffect, useState } from "react";

export function usePickupResource<T>(
  url: string,
  validate: (value: unknown) => value is T,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<{
    message: string;
    status: number;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body: unknown = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) {
          const message =
            body &&
            typeof body === "object" &&
            "message" in body &&
            typeof body.message === "string"
              ? body.message
              : "No pudimos consultar la solicitud.";
          setError({ message, status: response.status });
        } else if (validate(body)) setData(body);
        else throw new Error("Invalid pickup response");
      } catch {
        if (!controller.signal.aborted)
          setError({
            message:
              "No pudimos consultar tus solicitudes. Intenta nuevamente.",
            status: 503,
          });
      }
    }
    void load();
    return () => controller.abort();
  }, [url, validate, attempt]);
  return {
    data,
    error,
    reload: () => {
      setData(null);
      setError(null);
      setAttempt((value) => value + 1);
    },
  };
}
