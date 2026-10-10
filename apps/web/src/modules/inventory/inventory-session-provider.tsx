"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  isMovementReceipt,
  type InventoryDetails,
  type InventoryItem,
} from "./live-contract";
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
  const actionLock = useRef(false);
  const pendingMovement = useRef<{
    itemId: string;
    body: string;
    key: string;
  } | null>(null);
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
      if (!Number.isFinite(quantity) || quantity < 0 || actionLock.current)
        return false;
      const body = JSON.stringify({
        type,
        quantity,
        ...(reason ? { reason } : {}),
      });
      if (
        pendingMovement.current &&
        (pendingMovement.current.itemId !== itemId ||
          pendingMovement.current.body !== body)
      ) {
        setError(
          "El movimiento anterior aún no está confirmado. Reintenta con los mismos datos antes de registrar otro.",
        );
        return false;
      }
      actionLock.current = true;
      const attempt = pendingMovement.current ?? { itemId, body, key: id() };
      pendingMovement.current = attempt;
      setActionLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/bff/operational/inventory/${itemId}/movements`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": attempt.key,
              "X-Request-Id": id(),
            },
            body: attempt.body,
          },
        );
        if (!response.ok) {
          if (
            [400, 401, 403, 404, 413, 415, 422, 429].includes(response.status)
          )
            pendingMovement.current = null;
          throw new Error(await message(response));
        }
        const receipt: unknown = await response.json();
        if (
          !isMovementReceipt(receipt) ||
          receipt.itemId !== itemId ||
          receipt.type !== type
        )
          throw new Error(
            "No pudimos validar el movimiento. Reintenta con los mismos datos.",
          );
        pendingMovement.current = null;
        await refresh();
        return true;
      } catch (cause) {
        await refresh();
        setError(
          cause instanceof Error
            ? cause.message
            : "No pudimos registrar el movimiento.",
        );
        return false;
      } finally {
        actionLock.current = false;
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
