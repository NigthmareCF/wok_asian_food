"use client";
import { useRef, useState, useSyncExternalStore } from "react";
import { createAttemptStore } from "./attempt-store";
import { useClientIdentity } from "@/modules/clients/use-client-identity";
import { createClientOperation } from "@/modules/clients/client-identity-store";
export function useSubmission<P, R>(
  storageKey: string,
  url: string,
  parse: (v: unknown) => P | null,
  validate: (v: unknown) => v is R,
  userId?: string,
) {
  const { identity, verified } = useClientIdentity(userId, Boolean(userId));
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
    if (userId && !verified) {
      setError(
        "Verifica tu sesión antes de enviar. El intento guardado se conserva.",
      );
      return null;
    }
    const operation = userId ? createClientOperation(identity) : null;
    setError("");
    let current = attempt;
    if (!current) {
      const normalized = parse(payload);
      if (!normalized) {
        operation?.dispose();
        setError("Revisa los datos del formulario.");
        return null;
      }
      current = { key: crypto.randomUUID(), payload: normalized };
      try {
        store.save(current);
      } catch {
        operation?.dispose();
        setError("Permite el almacenamiento de esta pestaña antes de enviar.");
        return null;
      }
    }
    sending.current = true;
    setBusy(true);
    try {
      if (operation && !(await operation.confirm())) return null;
      store.save({ ...current, uncertain: true });
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": current.key,
          ...(userId ? { "X-Wok-Expected-Principal": userId } : {}),
        },
        body: JSON.stringify(current.payload),
        signal: operation?.signal ?? AbortSignal.timeout(15000),
      });
      const body: unknown = await response.json();
      if (operation && !(await operation.confirm())) return null;
      if (!response.ok) {
        if (!current.uncertain && [400, 422].includes(response.status))
          store.save(null);
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
      if (!operation || operation.valid())
        setError(
          "No pudimos confirmar el resultado. Reintenta la misma solicitud para evitar duplicados.",
        );
      return null;
    } finally {
      operation?.dispose();
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
  return {
    attempt: !userId || verified ? attempt : null,
    error,
    busy,
    send,
    clear,
  };
}
