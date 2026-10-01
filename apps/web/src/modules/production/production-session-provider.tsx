"use client";

import { createContext, useContext, useMemo, useState } from "react";
import {
  productionBatches,
  productionSuggestions,
  type ProductionBatch,
  type ProductionBatchStatus,
  type ProductionSuggestion,
} from "@/data/fixtures/production";

type StartBatchInput = {
  recipeName: string;
  category: string;
  quantityExpected: number;
  unit: string;
  responsible: string;
  notes?: string;
};

type CompleteBatchInput = {
  batchId: string;
  quantityActual: number;
  notes?: string;
};

type DiscardBatchInput = {
  batchId: string;
  reason: string;
};

type SuggestionAction = {
  suggestionId: string;
  action: "accept" | "reject";
  notes?: string;
};

type ProductionSessionContextValue = {
  batches: ProductionBatch[];
  suggestions: ProductionSuggestion[];
  startBatch: (input: StartBatchInput) => boolean;
  completeBatch: (input: CompleteBatchInput) => boolean;
  discardBatch: (input: DiscardBatchInput) => boolean;
  actOnSuggestion: (input: SuggestionAction) => boolean;
};

const ProductionSessionContext =
  createContext<ProductionSessionContextValue | null>(null);

export function ProductionSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [batches, setBatches] = useState<ProductionBatch[]>(productionBatches);
  const [suggestions, setSuggestions] =
    useState<ProductionSuggestion[]>(productionSuggestions);

  const value = useMemo<ProductionSessionContextValue>(
    () => ({
      batches,
      suggestions,
      startBatch({ recipeName, category, quantityExpected, unit, responsible, notes }) {
        const newBatch: ProductionBatch = {
          id: `bat-${Date.now()}`,
          recipeName,
          category,
          status: "active",
          quantityExpected,
          quantityActual: 0,
          unit,
          yieldPercent: 0,
          startedAt: new Date().toLocaleTimeString("es-GT", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }),
          createdBy: "Antony",
          responsible,
          notes,
        };
        setBatches((current) => [newBatch, ...current]);
        return true;
      },
      completeBatch({ batchId, quantityActual, notes }) {
        const batch = batches.find((b) => b.id === batchId);
        if (!batch) return false;
        const yieldPercent =
          batch.quantityExpected > 0
            ? Math.round((quantityActual / batch.quantityExpected) * 1000) / 10
            : 0;
        setBatches((current) =>
          current.map((b) =>
            b.id === batchId
              ? {
                  ...b,
                  status: "completed" as ProductionBatchStatus,
                  quantityActual,
                  yieldPercent,
                  completedAt: new Date().toLocaleTimeString("es-GT", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  }),
                  notes: notes || b.notes,
                }
              : b,
          ),
        );
        return true;
      },
      discardBatch({ batchId, reason }) {
        const batch = batches.find((b) => b.id === batchId);
        if (!batch) return false;
        setBatches((current) =>
          current.map((b) =>
            b.id === batchId
              ? {
                  ...b,
                  status: "discarded" as ProductionBatchStatus,
                  discardReason: reason,
                  completedAt: new Date().toLocaleTimeString("es-GT", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  }),
                }
              : b,
          ),
        );
        return true;
      },
      actOnSuggestion({ suggestionId, action }) {
        setSuggestions((current) =>
          current.map((s) =>
            s.id === suggestionId
              ? { ...s, status: action === "accept" ? "accepted" : "rejected" }
              : s,
          ),
        );
        return true;
      },
    }),
    [batches, suggestions],
  );

  return (
    <ProductionSessionContext.Provider value={value}>
      {children}
    </ProductionSessionContext.Provider>
  );
}

export function useProductionSession() {
  const context = useContext(ProductionSessionContext);
  if (!context) {
    throw new Error(
      "useProductionSession must be used inside ProductionSessionProvider",
    );
  }
  return context;
}
