"use client";
import { useRef, useState, useSyncExternalStore } from "react";
import { createAttemptStore } from "./attempt-store";
export function useSubmission<P, R>(
  storageKey: string,
  url: string,
  parse: (v: unknown) => P | null,
  validate: (v: unknown) => v is R,
) {
  const [store] = useState(() =>
    createAttemptStore(storageKey, parse, validate),
  );
  const attempt = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  async function send(payload: P): Promise<R | null> {
    if (sending.current || attempt?.receipt) return null;
    setError("");
    let current = attempt;
    if (!current) {
      const normalized = parse(payload);
      if (!normalized) {
        setError("Revisa los datos del formulario.");
        return null;
      }
      current = { key: crypto.randomUUID(), payload: normalized };
      try {
        store.save(current);
      } catch {
        setError("Permite el almacenamiento de esta pestaña antes de enviar.");
        return null;
      }
    }
    sending.current = true;
    setBusy(true);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": current.key,
        },
        body: JSON.stringify(current.payload),
        signal: AbortSignal.timeout(15000),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        if ([400, 422].includes(response.status)) store.save(null);
        setError(
          body &&
            typeof body === "object" &&
            "message" in body &&
            typeof body.message === "string"
            ? body.message
            : "No pudimos confirmar el resultado. Reintenta la misma solicitud.",
        );
        return null;
      }
      if (!validate(body)) throw new Error("Invalid response");
      store.save({ ...current, receipt: body });
      return body;
    } catch {
      setError(
        "No pudimos confirmar el resultado. Reintenta la misma solicitud para evitar duplicados.",
      );
      return null;
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  function clear() {
    try {
      store.save(null);
      setError("");
    } catch {
      setError("No se pudo cerrar el comprobante.");
    }
  }
  return { attempt, error, busy, send, clear };
}
