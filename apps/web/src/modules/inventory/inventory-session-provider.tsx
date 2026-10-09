"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { InventoryDetails, InventoryItem } from "./live-contract";
type InventoryContextValue = {
  items: InventoryItem[];
  loading: boolean;
  error: string | null;
  actionLoading: boolean;
  refresh: (query?: string) => Promise<void>;
  details: (itemId: string) => Promise<InventoryDetails | null>;
  recordMovement: (
    itemId: string,
    type: "ENTRY" | "ADJUSTMENT" | "WASTE",
    quantity: number,
    reason?: string,
  ) => Promise<boolean>;
};
const Context = createContext<InventoryContextValue | null>(null);
const id = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
async function message(response: Response) {
  return (
    ((await response.json().catch(() => null)) as { message?: string } | null)
      ?.message ?? "No pudimos completar la solicitud."
  );
}
export function InventorySessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const refresh = useCallback(async (query = "") => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/bff/operational/inventory${query ? `?${query}` : ""}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(await message(response));
      setItems((await response.json()) as InventoryItem[]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos cargar inventario.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  const details = useCallback(async (itemId: string) => {
    try {
      const response = await fetch(`/bff/operational/inventory/${itemId}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(await message(response));
      return (await response.json()) as InventoryDetails;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No pudimos cargar el item.",
      );
      return null;
    }
  }, []);
  const recordMovement = useCallback(
    async (
      itemId: string,
      type: "ENTRY" | "ADJUSTMENT" | "WASTE",
      quantity: number,
      reason?: string,
    ) => {
      if (quantity < 0) return false;
      setActionLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/bff/operational/inventory/${itemId}/movements`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": id(),
              "X-Request-Id": id(),
            },
            body: JSON.stringify({
              type,
              quantity,
              ...(reason ? { reason } : {}),
            }),
          },
        );
        if (!response.ok) throw new Error(await message(response));
        await refresh();
        return true;
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "No pudimos registrar el movimiento.",
        );
        await refresh();
        return false;
      } finally {
        setActionLoading(false);
      }
    },
    [refresh],
  );
  const value = useMemo(
    () => ({
      items,
      loading,
      error,
      actionLoading,
      refresh,
      details,
      recordMovement,
    }),
    [items, loading, error, actionLoading, refresh, details, recordMovement],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useInventorySession() {
  const context = useContext(Context);
  if (!context)
    throw new Error(
      "useInventorySession must be used inside InventorySessionProvider",
    );
  return context;
}
