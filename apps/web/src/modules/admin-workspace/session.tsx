"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { initialAdminState } from "@/data/fixtures/admin-workspace";
import type { AdminState, AuditInput } from "./models";

type Session = {
  state: AdminState;
  canManage: boolean;
  setCanManage: (value: boolean) => void;
  commit: (
    update: (state: AdminState) => AdminState,
    event: AuditInput,
  ) => void;
  filters: Record<string, string>;
  setFilter: (key: string, value: string) => void;
};
const Context = createContext<Session | null>(null);
export const createId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
export function AdminWorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AdminState>(() =>
    structuredClone(initialAdminState),
  );
  const [canManage, setCanManage] = useState(true);
  const [filters, setFilters] = useState<Record<string, string>>({});
  function commit(
    update: (state: AdminState) => AdminState,
    event: AuditInput,
  ) {
    if (!canManage) return;
    const audit = {
      ...event,
      id: createId("AUD"),
      date: new Date().toISOString(),
      actor: "Administración demo",
      result: "Simulado",
    };
    setState((current) => {
      const next = update(current);
      return { ...next, audit: [audit, ...next.audit] };
    });
  }
  return (
    <Context.Provider
      value={{
        state,
        canManage,
        setCanManage,
        commit,
        filters,
        setFilter: (key, value) =>
          setFilters((current) => ({ ...current, [key]: value })),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAdminWorkspace() {
  const context = useContext(Context);
  if (!context) throw new Error("Falta AdminWorkspaceProvider");
  return context;
}
export function useAdminFilter(
  key: string,
  fallback = "",
): [string, (value: string) => void] {
  const { filters, setFilter } = useAdminWorkspace();
  return [filters[key] ?? fallback, (value) => setFilter(key, value)];
}
