"use client";
import { useRef, useState } from "react";

class MutationError extends Error {}

export function useLiveMutation() {
  const locked = useRef(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  async function run<T>(options: {
    url: string;
    method: "POST" | "PATCH";
    body?: unknown;
    key?: string;
    validate: (v: unknown) => v is T;
    reload: () => void;
    success?: (v: T) => void;
  }) {
    if (locked.current) return;
    locked.current = true;
    setSending(true);
    setError("");
    try {
      const response = await fetch(options.url, {
        method: options.method,
        headers: {
          "X-Request-Id": crypto.randomUUID(),
          ...(options.key ? { "Idempotency-Key": options.key } : {}),
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      });
      const body: unknown = await response.json().catch(() => null);
      if (response.status === 409 || response.status === 404) {
        options.reload();
        throw new MutationError(
          response.status === 409
            ? "El estado cambió o la clave ya se utilizó (409). Recargamos los datos; revísalos antes de continuar."
            : "El registro ya no existe (404). Recargamos los datos.",
        );
      }
      if (!response.ok)
        throw new MutationError(
          response.status === 401
            ? "Tu sesión expiró. Inicia sesión nuevamente."
            : response.status === 403
              ? "Tu cuenta no tiene permiso para esta acción."
              : response.status === 400 || response.status === 422
                ? "Revisa la cuenta, los productos y las cantidades. Actualiza los datos antes de continuar."
                : "No pudimos confirmar el resultado. Reintenta sin cambiar los datos.",
        );
      if (!options.validate(body))
        throw new MutationError(
          "No pudimos confirmar el resultado. Reintenta sin cambiar los datos.",
        );
      options.success?.(body);
      options.reload();
    } catch (e) {
      setError(
        e instanceof MutationError
          ? e.message
          : "No pudimos confirmar el resultado. Reintenta sin cambiar los datos.",
      );
    } finally {
      locked.current = false;
      setSending(false);
    }
  }
  return { run, sending, error };
}
