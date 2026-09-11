"use client";

import { createContext, useContext, useMemo, useState } from "react";
import {
  inventoryItems,
  inventoryMovements,
  type InventoryItem,
  type InventoryMovement,
  type InventoryMovementType,
  type InventoryAdjustmentReason,
} from "@/data/fixtures/inventory";

type AddEntryInput = {
  itemId: string;
  quantity: number;
  expiryDate: string;
  supplier: string;
  cost: number;
  batchCode?: string;
};

type AdjustStockInput = {
  itemId: string;
  quantity: number;
  reason: InventoryAdjustmentReason;
  lotId?: string;
  notes?: string;
};

type InventorySessionContextValue = {
  items: InventoryItem[];
  movements: InventoryMovement[];
  addEntry: (input: AddEntryInput) => boolean;
  adjustStock: (input: AdjustStockInput) => boolean;
};

const InventorySessionContext =
  createContext<InventorySessionContextValue | null>(null);

export function InventorySessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [items, setItems] = useState<InventoryItem[]>(inventoryItems);
  const [movements, setMovements] =
    useState<InventoryMovement[]>(inventoryMovements);

  const value = useMemo<InventorySessionContextValue>(
    () => ({
      items,
      movements,
      addEntry({ itemId, quantity, expiryDate, supplier, cost, batchCode }) {
        const item = items.find((i) => i.id === itemId);
        if (!item || quantity <= 0) return false;

        const newLot = {
          id: `lot-${Date.now()}`,
          itemId,
          quantity,
          entryDate: new Date().toISOString().split("T")[0],
          expiryDate,
          supplier,
          cost,
          batchCode,
        };

        const newMovement: InventoryMovement = {
          id: `imv-${Date.now()}`,
          itemId,
          itemName: item.name,
          type: "entry",
          quantity,
          createdBy: "Antony",
          createdAt: new Date().toLocaleTimeString("es-GT", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }),
        };

        setItems((current) =>
          current.map((i) =>
            i.id === itemId
              ? {
                  ...i,
                  stock: i.stock + quantity,
                  available: i.available + quantity,
                  lots: [...i.lots, newLot],
                  lastEntry: newMovement.createdAt,
                  status:
                    i.stock + quantity >= i.minStock ? "available" : i.status,
                }
              : i,
          ),
        );
        setMovements((current) => [newMovement, ...current]);
        return true;
      },
      adjustStock({ itemId, quantity, reason, lotId, notes }) {
        const item = items.find((i) => i.id === itemId);
        if (!item) return false;

        const newStock = item.stock + quantity;
        if (newStock < 0) return false;

        let newStatus: InventoryItem["status"] = item.status;
        if (newStock <= 0) newStatus = "critical";
        else if (newStock < item.minStock) newStatus = "low";
        else newStatus = "available";

        const newMovement: InventoryMovement = {
          id: `imv-${Date.now()}`,
          itemId,
          itemName: item.name,
          type: "adjustment",
          quantity,
          lotId,
          reason: notes || reason,
          createdBy: "Antony",
          createdAt: new Date().toLocaleTimeString("es-GT", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }),
        };

        setItems((current) =>
          current.map((i) =>
            i.id === itemId
              ? {
                  ...i,
                  stock: newStock,
                  available: Math.max(0, newStock - i.reserved),
                  status: newStatus,
                  lastAdjustment: newMovement.createdAt,
                }
              : i,
          ),
        );
        setMovements((current) => [newMovement, ...current]);
        return true;
      },
    }),
    [items, movements],
  );

  return (
    <InventorySessionContext.Provider value={value}>
      {children}
    </InventorySessionContext.Provider>
  );
}

export function useInventorySession() {
  const context = useContext(InventorySessionContext);
  if (!context) {
    throw new Error(
      "useInventorySession must be used inside InventorySessionProvider",
    );
  }
  return context;
}
