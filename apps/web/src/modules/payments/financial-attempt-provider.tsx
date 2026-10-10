"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { isUuid } from "@/modules/checkout/pickup-contract";
import { object } from "./live-contract";
export type FinancialAttempt = {
  v: 2;
  userId: string;
  accountId: string;
  attemptId: string;
};
export type FinancialIdentity = { userId: string; generation: number };
export const attemptPrefix = "wok:finance:v2:";
export const legacyAttemptPrefix = "wok:finance:v1:";
export function parseAttempt(
  v: unknown,
  userId: string,
  accountId: string,
): FinancialAttempt | null {
  return object(v) &&
    Object.keys(v).every((k) =>
      ["v", "userId", "accountId", "attemptId"].includes(k),
    ) &&
    v.v === 2 &&
    v.userId === userId &&
    v.accountId === accountId &&
    isUuid(userId) &&
    isUuid(accountId) &&
    isUuid(v.attemptId)
    ? { v: 2, userId, accountId, attemptId: v.attemptId }
    : null;
}
type Value = {
  userId: string;
  permissions: readonly string[];
  ready: boolean;
  selections: Record<string, FinancialAttempt>;
  legacyHints: Record<string, string>;
  storageNotice: string;
  identity: () => FinancialIdentity;
  valid: (identity: FinancialIdentity) => boolean;
  select: (accountId: string, attemptId: string) => void;
  ensureSession: (required?: readonly string[]) => Promise<void>;
};
const Context = createContext<Value | null>(null);
export function FinancialAttemptProvider({
  userId,
  permissions,
  children,
}: {
  userId: string;
  permissions: readonly string[];
  children: React.ReactNode;
}) {
  const current = useRef(userId);
  useLayoutEffect(() => {
    current.current = userId;
  }, [userId]);
  const lifecycle = useRef({ active: false, generation: 0 });
  const [state, setState] = useState<{
    owner: string;
    ready: boolean;
    selections: Record<string, FinancialAttempt>;
    legacyHints: Record<string, string>;
    notice: string;
  }>({
    owner: userId,
    ready: false,
    selections: {},
    legacyHints: {},
    notice: "",
  });
  const [authority, setAuthority] = useState<{
    owner: string;
    permissions: readonly string[];
  }>({ owner: userId, permissions });
  const identity = useCallback(
    () => ({
      userId: current.current,
      generation: lifecycle.current.generation,
    }),
    [],
  );
  const valid = useCallback(
    (ticket: FinancialIdentity) =>
      lifecycle.current.active &&
      ticket.userId === current.current &&
      ticket.generation === lifecycle.current.generation,
    [],
  );
  useEffect(() => {
    lifecycle.current = {
      active: true,
      generation: lifecycle.current.generation + 1,
    };
    const ticket = identity(),
      selections: Record<string, FinancialAttempt> = {},
      legacyHints: Record<string, string> = {};
    let notice = "";
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (!key) continue;
        const prefix = key.startsWith(attemptPrefix + userId + ":")
          ? attemptPrefix
          : key.startsWith(legacyAttemptPrefix + userId + ":")
            ? legacyAttemptPrefix
            : null;
        if (!prefix) continue;
        const accountId = key.slice((prefix + userId + ":").length);
        if (!isUuid(accountId)) continue;
        try {
          const input: unknown = JSON.parse(
            sessionStorage.getItem(key) ?? "null",
          );
          if (prefix === attemptPrefix) {
            const ref = parseAttempt(input, userId, accountId);
            if (ref) selections[accountId] = ref;
            else
              notice =
                "La selección local no es válida. Consultaremos los intentos del servidor.";
          } else if (
            object(input) &&
            input.v === 1 &&
            input.userId === userId &&
            input.accountId === accountId &&
            isUuid(input.key)
          )
            legacyHints[accountId] = input.key;
        } catch {
          notice =
            "La selección local no se pudo leer. Consultaremos el servidor.";
        }
      }
    } catch {
      notice =
        "El almacenamiento no está disponible. La recuperación sigue disponible desde el servidor.";
    }
    queueMicrotask(() => {
      if (valid(ticket)) {
        setState({
          owner: userId,
          ready: true,
          selections,
          legacyHints,
          notice,
        });
        setAuthority({ owner: userId, permissions });
      }
    });
    const logout = () => {
      lifecycle.current.active = false;
      lifecycle.current.generation++;
      setState({
        owner: userId,
        ready: false,
        selections: {},
        legacyHints: {},
        notice: "La sesión terminó. Los registros del servidor se conservan.",
      });
      setAuthority({ owner: userId, permissions: [] });
    };
    window.addEventListener("wok:logout", logout);
    return () => {
      lifecycle.current.active = false;
      lifecycle.current.generation++;
      window.removeEventListener("wok:logout", logout);
    };
  }, [userId, permissions, identity, valid]);
  const select = useCallback((accountId: string, attemptId: string) => {
    if (!lifecycle.current.active || !isUuid(accountId) || !isUuid(attemptId))
      return;
    const owner = current.current,
      ref: FinancialAttempt = { v: 2, userId: owner, accountId, attemptId };
    let notice = "";
    try {
      sessionStorage.setItem(
        attemptPrefix + owner + ":" + accountId,
        JSON.stringify(ref),
      );
    } catch {
      notice =
        "No se guardó la selección local; el intento durable sigue en el servidor.";
    }
    setState((old) =>
      old.owner === owner
        ? {
            ...old,
            selections: { ...old.selections, [accountId]: ref },
            notice: notice || old.notice,
          }
        : old,
    );
  }, []);
  const ensureSession = useCallback(
    async (required: readonly string[] = ["payments:manage"]) => {
      const ticket = identity();
      if (!valid(ticket))
        throw Error("La sesión cambió. Consulta con el operador original.");
      const response = await fetch("/bff/auth/session", { cache: "no-store" });
      if (!valid(ticket)) throw Error("La sesión cambió.");
      const body: unknown = await response.json().catch(() => null);
      if (!valid(ticket)) throw Error("La sesión cambió.");
      if (
        !response.ok ||
        !object(body) ||
        !object(body.user) ||
        body.user.userId !== ticket.userId ||
        !Array.isArray(body.user.permissions) ||
        !body.user.permissions.every((p) => typeof p === "string") ||
        !required.every(
          (p) =>
            (body.user as Record<string, unknown>).permissions &&
            (body.user as { permissions: string[] }).permissions.includes(p),
        )
      ) {
        setAuthority((old) =>
          old.owner === ticket.userId && old.permissions.length === 0
            ? old
            : { owner: ticket.userId, permissions: [] },
        );
        throw Error(
          "La sesión o los permisos cambiaron. El registro durable se conserva.",
        );
      }
      const fresh = body.user.permissions as string[];
      setAuthority((old) =>
        old.owner === ticket.userId &&
        old.permissions.length === fresh.length &&
        old.permissions.every((p) => fresh.includes(p))
          ? old
          : { owner: ticket.userId, permissions: fresh },
      );
    },
    [identity, valid],
  );
  return (
    <Context.Provider
      value={{
        userId,
        permissions:
          authority.owner === userId ? authority.permissions : permissions,
        ready: state.owner === userId && state.ready,
        selections: state.owner === userId ? state.selections : {},
        legacyHints: state.owner === userId ? state.legacyHints : {},
        storageNotice: state.owner === userId ? state.notice : "",
        identity,
        valid,
        select,
        ensureSession,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useFinancialAttempts() {
  const value = useContext(Context);
  if (!value) throw Error("FinancialAttemptProvider is required");
  return value;
}
