"use client";

import { createContext, useContext, useMemo, useState } from "react";
import {
  initialServiceStatus,
  type ServiceStatusRecord,
  type ServiceStatusValue,
} from "@/data/fixtures/production";

type SetStatusInput = {
  status: ServiceStatusValue;
  reason: string;
};

type ServiceStatusContextValue = {
  service: ServiceStatusRecord;
  setStatus: (input: SetStatusInput) => boolean;
};

const ServiceStatusContext = createContext<ServiceStatusContextValue | null>(null);

export function ServiceStatusProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [service, setService] = useState<ServiceStatusRecord>(initialServiceStatus);

  const value = useMemo<ServiceStatusContextValue>(
    () => ({
      service,
      setStatus({ status, reason }) {
        if (!reason.trim()) return false;
        const now = new Date().toLocaleTimeString("es-GT", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        setService((current) => ({
          currentStatus: status,
          reason,
          changedBy: "Antony",
          changedAt: now,
          history: [
            {
              status,
              reason,
              changedBy: "Antony",
              changedAt: now,
            },
            ...current.history,
          ],
        }));
        return true;
      },
    }),
    [service],
  );

  return (
    <ServiceStatusContext.Provider value={value}>
      {children}
    </ServiceStatusContext.Provider>
  );
}

export function useServiceStatus() {
  const context = useContext(ServiceStatusContext);
  if (!context) {
    throw new Error(
      "useServiceStatus must be used inside ServiceStatusProvider",
    );
  }
  return context;
}