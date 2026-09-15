"use client";

import { createContext, useContext, useMemo, useState } from "react";
import {
  paymentsRecords,
  type PaymentRecord,
  type PaymentEntry,
  type PaymentMethod,
  type PaymentStatus,
  type SplitPaymentProposal,
} from "@/data/fixtures/payments";

type AddPaymentInput = {
  recordId: string;
  method: PaymentMethod;
  amount: number;
  reference?: string;
  collectedBy: string;
};

type SplitPaymentInput = {
  recordId: string;
  proposals: SplitPaymentProposal[];
};

type PaymentsSessionContextValue = {
  records: PaymentRecord[];
  addPayment: (input: AddPaymentInput) => boolean;
  splitPayment: (input: SplitPaymentInput) => boolean;
  applyTip: (recordId: string, tip: number) => boolean;
  applyDiscount: (recordId: string, discount: number) => boolean;
};

const PaymentsSessionContext = createContext<PaymentsSessionContextValue | null>(null);

export function PaymentsSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [records, setRecords] = useState<PaymentRecord[]>(paymentsRecords);

  const value = useMemo<PaymentsSessionContextValue>(
    () => ({
      records,
      addPayment({ recordId, method, amount, reference, collectedBy }) {
        const record = records.find((r) => r.id === recordId);
        if (!record) return false;

        const newPayment: PaymentEntry = {
          id: `pay-${Date.now()}`,
          method,
          amount,
          reference,
          collectedAt: new Date().toLocaleTimeString("es-GT", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }),
          collectedBy,
        };

        const newTotal = record.payments.reduce((sum, p) => sum + p.amount, 0) + amount;
        let newStatus: PaymentStatus = "partial";
        if (newTotal >= record.total) {
          newStatus = newTotal > record.total ? "difference" : "paid";
        } else if (newTotal > 0) {
          newStatus = "partial";
        } else {
          newStatus = "pending";
        }

        setRecords((current) =>
          current.map((r) =>
            r.id === recordId
              ? {
                  ...r,
                  payments: [...r.payments, newPayment],
                  status: newStatus,
                }
              : r,
          ),
        );

        return true;
      },
      splitPayment({ recordId, proposals }) {
        const record = records.find((r) => r.id === recordId);
        if (!record) return false;

        const totalProposed = proposals.reduce((sum, p) => sum + p.total, 0);
        if (totalProposed !== record.total) return false;

        setRecords((current) =>
          current.map((r) =>
            r.id === recordId
              ? {
                  ...r,
                  items: proposals.flatMap((p, i) =>
                    p.items.map((item) => ({ ...item, assignedTo: p.name })),
                  ),
                }
              : r,
          ),
        );

        return true;
      },
      applyTip(recordId, tip) {
        const record = records.find((r) => r.id === recordId);
        if (!record) return false;

        const newTotal = record.subtotal + tip - record.discount;
        setRecords((current) =>
          current.map((r) =>
            r.id === recordId ? { ...r, tip, total: newTotal } : r,
          ),
        );
        return true;
      },
      applyDiscount(recordId, discount) {
        const record = records.find((r) => r.id === recordId);
        if (!record) return false;

        const newTotal = record.subtotal + record.tip - discount;
        setRecords((current) =>
          current.map((r) =>
            r.id === recordId ? { ...r, discount, total: newTotal } : r,
          ),
        );
        return true;
      },
    }),
    [records],
  );

  return (
    <PaymentsSessionContext.Provider value={value}>
      {children}
    </PaymentsSessionContext.Provider>
  );
}

export function usePaymentsSession() {
  const context = useContext(PaymentsSessionContext);
  if (!context) {
    throw new Error("usePaymentsSession must be used inside PaymentsSessionProvider");
  }
  return context;
}