"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFinancialAttempts } from "@/modules/payments/financial-attempt-provider";
import { isCashSession, type CashSession } from "./live-contract";
export function useLiveCashSession(registerCode: string) {
  const owner = useFinancialAttempts();
  const [session, setSession] = useState<CashSession | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [sending, setSending] = useState(false);
  const id = useRef<string | null>(null),
    latch = useRef(false),
    generation = useRef(0),
    mounted = useRef(true);
  const actionError = useRef("");
  const currentSession = useRef<CashSession | null>(null);
  const attempt = useRef<{
    key: string;
    payload: { registerCode: string; openingFloat: number };
  } | null>(null);
  const refresh = useCallback(async () => {
    const ticket = ++generation.current;
    try {
      const requestedId = id.current;
      const response = await fetch(
        requestedId
          ? `/bff/operational/cash-sessions/${requestedId}`
          : `/bff/operational/cash-sessions/current?registerCode=${encodeURIComponent(registerCode)}`,
        { cache: "no-store" },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!mounted.current || generation.current !== ticket) return null;
      if (response.status === 404 && !id.current) {
        setSession(null);
        setError(actionError.current);
        return null;
      }
      if (!response.ok || !isCashSession(body))
        throw new Error("No pudimos consultar el turno de caja.");
      if (requestedId && body.id !== requestedId)
        throw new Error("El turno consultado no coincide.");
      currentSession.current = body;
      id.current = body.id;
      setSession(body);
      setError(actionError.current);
      return body;
    } catch (cause) {
      if (mounted.current && generation.current === ticket)
        setError(
          cause instanceof Error ? cause.message : "Sin conexión con caja.",
        );
      return null;
    } finally {
      if (mounted.current && generation.current === ticket) setLoading(false);
    }
  }, [registerCode]);
  useEffect(() => {
    mounted.current = true;
    id.current = null;
    currentSession.current = null;
    const initial = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 5000);
    return () => {
      mounted.current = false;
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [refresh]);
  async function mutate(
    kind: "open" | "close",
    payload:
      | { registerCode: string; openingFloat: number }
      | { countedCash: number; expectedVersion: number },
    sessionId?: string,
  ) {
    const targetId = sessionId;
    const targetVersion =
      kind === "close"
        ? (payload as { expectedVersion: number }).expectedVersion
        : null;
    const sameCount = () =>
      mounted.current &&
      targetId === id.current &&
      targetId === currentSession.current?.id &&
      currentSession.current.status === "OPEN" &&
      targetVersion === currentSession.current.rowVersion;
    if (latch.current) return false;
    latch.current = true;
    setSending(true);
    actionError.current = "";
    setError("");
    try {
      if (kind === "close" && !sameCount())
        throw new Error(
          "El turno o su versión cambió. Debes iniciar un nuevo conteo.",
        );
      const auth = await fetch("/bff/auth/session", { cache: "no-store" });
      const current = await auth.json();
      if (
        !auth.ok ||
        current?.user?.userId !== owner.userId ||
        !Array.isArray(current?.user?.permissions) ||
        !current.user.permissions.includes("cash:manage")
      )
        throw new Error("La sesión o los permisos de caja cambiaron.");
      let key: string | undefined;
      if (kind === "open") {
        const input = payload as { registerCode: string; openingFloat: number };
        if (
          attempt.current &&
          JSON.stringify(attempt.current.payload) !== JSON.stringify(input)
        )
          throw new Error(
            "Recupera primero la apertura original con el mismo importe.",
          );
        attempt.current ??= { key: crypto.randomUUID(), payload: input };
        key = attempt.current.key;
      }
      if (kind === "close" && !sameCount())
        throw new Error(
          "El turno o su versión cambió. Debes iniciar un nuevo conteo.",
        );
      const response = await fetch(
        kind === "open"
          ? "/bff/operational/cash-sessions"
          : `/bff/operational/cash-sessions/${targetId}/close`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Request-Id": crypto.randomUUID(),
            "X-Financial-Actor": owner.userId,
            ...(key ? { "Idempotency-Key": key } : {}),
          },
          body: JSON.stringify(payload),
        },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok || !isCashSession(body)) {
        if (kind === "open" && [400, 422].includes(response.status))
          attempt.current = null;
        await refresh();
        throw new Error(
          body &&
            typeof body === "object" &&
            "message" in body &&
            typeof body.message === "string"
            ? body.message
            : "Resultado incierto: consulta el turno antes de repetir.",
        );
      }
      if (kind === "close" && body.id !== targetId)
        throw new Error("El turno confirmado no coincide.");
      currentSession.current = body;
      id.current = body.id;
      setSession(body);
      attempt.current = null;
      return true;
    } catch (cause) {
      actionError.current =
        cause instanceof Error
          ? cause.message
          : "Resultado incierto: consulta el turno antes de repetir.";
      setError(actionError.current);
      return false;
    } finally {
      latch.current = false;
      setSending(false);
    }
  }
  return {
    session,
    error,
    loading,
    sending,
    refresh: () => {
      actionError.current = "";
      return refresh();
    },
    permissions: owner.permissions,
    open: (openingFloat: number) =>
      mutate("open", { registerCode, openingFloat }),
    close: (sessionId: string, countedCash: number, expectedVersion: number) =>
      mutate("close", { countedCash, expectedVersion }, sessionId),
    newTurn: () => {
      generation.current++;
      id.current = null;
      currentSession.current = null;
      setSession(null);
      void refresh();
    },
  };
}
