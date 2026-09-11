"use client";

import { createContext, useContext, useMemo, useState } from "react";
import {
  initialCashSession,
  type CashSession,
  type CashMovement,
  type CashMovementType,
  type CashMovementStatus,
  cashCategories,
} from "@/data/fixtures/cash";

type AddMovementInput = {
  type: CashMovementType;
  amount: number;
  description: string;
  category: string;
  reference?: string;
};

type CloseCashInput = {
  countedAmount: number;
  notes?: string;
};

type CashSessionContextValue = {
  session: CashSession;
  addMovement: (input: AddMovementInput) => boolean;
  updateMovementStatus: (movementId: string, status: CashMovementStatus) => boolean;
  closeCash: (input: CloseCashInput) => boolean;
};

const CashSessionContext = createContext<CashSessionContextValue | null>(null);

export function CashSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, setSession] = useState<CashSession>(initialCashSession);

  const value = useMemo<CashSessionContextValue>(
    () => ({
      session,
      addMovement({ type, amount, description, category, reference }) {
        if (amount <= 0) return false;

        const newMovement: CashMovement = {
          id: `mov-${Date.now()}`,
          type,
          amount,
          description,
          category,
          status: "confirmed",
          createdAt: new Date().toLocaleTimeString("es-GT", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }),
          createdBy: "Antony",
          reference,
        };

        setSession((current) => {
          const newMovements = [...current.movements, newMovement];
          let newCurrent = current.currentAmount;
          if (type === "income" || type === "deposit") {
            newCurrent += amount;
          } else {
            newCurrent -= amount;
          }
          const summary = getCashSummary({ ...current, movements: newMovements, currentAmount: newCurrent });
          return {
            ...current,
            movements: newMovements,
            currentAmount: newCurrent,
            expectedAmount: summary.expectedCash,
            difference: summary.difference,
          };
        });

        return true;
      },
      updateMovementStatus(movementId, status) {
        setSession((current) => ({
          ...current,
          movements: current.movements.map((m) =>
            m.id === movementId ? { ...m, status } : m,
          ),
        }));
        return true;
      },
      closeCash({ countedAmount, notes }) {
        if (session.status !== "open") return false;

        setSession((current) => ({
          ...current,
          status: "closed",
          currentAmount: countedAmount,
          difference: countedAmount - current.expectedAmount,
          closedAt: new Date().toLocaleTimeString("es-GT", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }),
          closedBy: "Antony",
          closingNotes: notes,
        }));

        return true;
      },
    }),
    [session],
  );

  return (
    <CashSessionContext.Provider value={value}>
      {children}
    </CashSessionContext.Provider>
  );
}

function getCashSummary(session: CashSession) {
  const income = session.movements
    .filter((m) => m.type === "income" && m.status === "confirmed")
    .reduce((sum, m) => sum + m.amount, 0);
  const expenses = session.movements
    .filter((m) => m.type === "expense" && m.status === "confirmed")
    .reduce((sum, m) => sum + m.amount, 0);
  const withdrawals = session.movements
    .filter((m) => m.type === "withdrawal" && m.status === "confirmed")
    .reduce((sum, m) => sum + m.amount, 0);
  const deposits = session.movements
    .filter((m) => m.type === "deposit" && m.status === "confirmed")
    .reduce((sum, m) => sum + m.amount, 0);

  const netCash = income - expenses - withdrawals + deposits;
  const expectedCash = session.initialAmount + netCash;
  const difference = session.currentAmount - expectedCash;

  return {
    totalIncome: income,
    totalExpenses: expenses,
    totalWithdrawals: withdrawals,
    totalDeposits: deposits,
    netCash,
    expectedCash,
    difference,
  };
}

export function useCashSession() {
  const context = useContext(CashSessionContext);
  if (!context) {
    throw new Error("useCashSession must be used inside CashSessionProvider");
  }
  return context;
}