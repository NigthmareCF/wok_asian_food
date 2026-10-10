"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { CashSession } from "./live-contract";

type CashSessionContextValue = {
  session: CashSession | null;
  loading: boolean;
  error: string | null;
  actionLoading: boolean;
  refresh: () => Promise<void>;
  openCash: (openingFloat: number) => Promise<boolean>;
  addMovement: (
    type: "INCOME" | "EXPENSE" | "WITHDRAWAL",
    amount: number,
    reason: string,
  ) => Promise<boolean>;
  closeCash: (countedCash: number) => Promise<boolean>;
};

const Context = createContext<CashSessionContextValue | null>(null);
const makeId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

async function readError(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    message?: string;
  } | null;
  return body?.message ?? "No pudimos completar la solicitud.";
}

export function CashSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, setSession] = useState<CashSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        "/bff/operational/cash-sessions?registerCode=MAIN",
        { cache: "no-store" },
      );
      if (response.status === 404) {
        setSession(null);
        return;
      }
      if (!response.ok) throw new Error(await readError(response));
      setSession((await response.json()) as CashSession);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No pudimos cargar la caja.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadInitial = async () => {
      try {
        const response = await fetch("/bff/operational/cash-sessions?registerCode=MAIN", { cache: "no-store" });
        if (cancelled) return;
        if (response.status === 404) {
          setSession(null);
          return;
        }
        if (!response.ok) throw new Error(await readError(response));
        setSession(await response.json() as CashSession);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "No pudimos cargar la caja.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadInitial();
    return () => { cancelled = true; };
  }, []);

  const perform = useCallback(
    async (url: string, init: RequestInit) => {
      setActionLoading(true);
      setError(null);
      try {
        const response = await fetch(url, init);
        if (!response.ok) throw new Error(await readError(response));
        return await response.json();
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "No pudimos completar la solicitud.",
        );
        await refresh();
        return null;
      } finally {
        setActionLoading(false);
      }
    },
    [refresh],
  );

  const value = useMemo<CashSessionContextValue>(
    () => ({
      session,
      loading,
      error,
      actionLoading,
      refresh,
      async openCash(openingFloat) {
        if (openingFloat < 0) return false;
        const result = await perform("/bff/operational/cash-sessions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": makeId(),
            "X-Request-Id": makeId(),
          },
          body: JSON.stringify({ registerCode: "MAIN", openingFloat }),
        });
        if (!result) return false;
        setSession(result as CashSession);
        return true;
      },
      async addMovement(type, amount, reason) {
        if (!session || amount <= 0 || reason.trim().length < 3) return false;
        const result = await perform(
          `/bff/operational/cash-sessions/${session.id}/movements`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": makeId(),
              "X-Request-Id": makeId(),
            },
            body: JSON.stringify({ type, amount, reason: reason.trim() }),
          },
        );
        if (!result) return false;
        await refresh();
        return true;
      },
      async closeCash(countedCash) {
        if (!session || countedCash < 0) return false;
        const result = await perform(
          `/bff/operational/cash-sessions/${session.id}/close`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Request-Id": makeId(),
            },
            body: JSON.stringify({
              countedCash,
              expectedVersion: session.rowVersion,
            }),
          },
        );
        if (!result) return false;
        setSession(result as CashSession);
        return true;
      },
    }),
    [session, loading, error, actionLoading, refresh, perform],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useCashSession() {
  const context = useContext(Context);
  if (!context)
    throw new Error("useCashSession must be used inside CashSessionProvider");
  return context;
}
