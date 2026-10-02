"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import { createClientSessionStore, emptyClientSession } from "./client-session";

// Memoria del módulo Cliente: sobrevive a /menu en la SPA; una recarga la reinicia.
// El servidor siempre lee el snapshot vacío y nunca ejecuta las acciones de usuario.
const sessionStore = createClientSessionStore();
type SessionStore = ReturnType<typeof createClientSessionStore>;
const ClientSessionContext = createContext<SessionStore | null>(null);

export function ClientSessionProvider({
  children,
  store = sessionStore,
}: {
  children: React.ReactNode;
  store?: SessionStore;
}) {
  return <ClientSessionContext value={store}>{children}</ClientSessionContext>;
}

export function useClientSession() {
  const store = useContext(ClientSessionContext);
  if (!store) throw new Error("ClientSessionProvider is required");
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => emptyClientSession,
  );
  return { ...state, ...store };
}
