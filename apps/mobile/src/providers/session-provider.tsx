import * as SecureStore from "expo-secure-store";
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { ApiError, apiRequest, TokenPair } from "@/lib/api";
import { tokenPairSchema } from "@/lib/identity";
import { createSessionState } from "@/lib/session-state";

type Session = { accessToken: string; email: string; offline: boolean; version: number };
type SessionContextValue = {
  session: Session | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, displayName: string, password: string) => Promise<string>;
  verify: (email: string, code: string) => Promise<void>;
  resendVerification: (email: string) => Promise<string>;
  requestPasswordReset: (email: string) => Promise<string>;
  completePasswordReset: (email: string, code: string, newPassword: string) => Promise<string>;
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  logout: () => Promise<void>;
};
const SessionContext = createContext<SessionContextValue | null>(null);

async function requestTokens(path: string, body: object): Promise<TokenPair> {
  const result = tokenPairSchema.safeParse(await apiRequest<unknown>(path, { method: "POST", body: JSON.stringify(body) }));
  if (!result.success) throw new ApiError("No se pudo validar la sesión del servidor.", 503);
  return result.data;
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [persistence] = useState(() => createSessionState(SecureStore));
  const rotation = useRef<{ token: string; task: Promise<TokenPair>; expiresAt: number } | null>(null);

  const rotate = useMemo(() => (refreshToken: string) => {
    if (rotation.current?.token === refreshToken && rotation.current.expiresAt > Date.now()) return rotation.current.task;
    const entry = { token: refreshToken, task: requestTokens("/api/v1/auth/refresh", { refreshToken }), expiresAt: Infinity };
    rotation.current = entry;
    void entry.task.then(() => { entry.expiresAt = Date.now() + 30_000; }, () => {
      if (rotation.current === entry) rotation.current = null;
    });
    return entry.task;
  }, []);

  useEffect(() => {
    let mounted = true;
    const version = persistence.current();
    async function restore() {
      if (Platform.OS === "web") { setReady(true); return; }
      let email: string | null = null;
      try {
        const stored = await persistence.read(version);
        email = stored.email;
        if (!stored.refreshToken || !email) return;
        const tokens = await rotate(stored.refreshToken);
        if (!mounted) return;
        await persistence.save(version, tokens.refreshToken, email);
        if (mounted) setSession({ accessToken: tokens.accessToken, email, offline: false, version });
      } catch (error) {
        if (!mounted || version !== persistence.current()) return;
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          await persistence.clear(version);
        } else if (email) setSession({ accessToken: "", email, offline: true, version });
      } finally { if (mounted) setReady(true); }
    }
    void restore().catch(() => { if (mounted) setReady(true); });
    return () => { mounted = false; };
  }, [persistence, rotate]);

  const value = useMemo<SessionContextValue>(() => {
    async function invalidate(version: number) {
      if (version !== persistence.current()) return;
      rotation.current = null;
      setSession(null);
      await persistence.clear(persistence.advance());
    }
    async function refresh(version: number, current: Session) {
      const { refreshToken } = await persistence.read(version);
      if (!refreshToken) { await invalidate(version); throw new ApiError("Inicia sesión nuevamente.", 401); }
      try {
        const tokens = await rotate(refreshToken);
        await persistence.save(version, tokens.refreshToken, current.email);
        const next = { accessToken: tokens.accessToken, email: current.email, offline: false, version };
        setSession(next);
        return next;
      } catch (error) {
        if (version === persistence.current()) {
          if (error instanceof ApiError && (error.status === 401 || error.status === 403)) await invalidate(version);
          else if (!current.offline) setSession({ ...current, offline: true });
        }
        throw error;
      }
    }
    async function message(path: string, body: object) {
      const result = await apiRequest<{ message: string }>(path, { method: "POST", body: JSON.stringify(body) });
      if (typeof result.message !== "string") throw new ApiError("El servidor no devolvió una respuesta válida.", 503);
      return result.message;
    }
    return {
      session, ready,
      async login(email, password) {
        if (Platform.OS === "web") throw new ApiError("Inicia sesión desde la aplicación móvil para proteger tu sesión.");
        if (!ready) throw new ApiError("Espera mientras comprobamos tu sesión.");
        const version = persistence.advance();
        rotation.current = null;
        const tokens = await requestTokens("/api/v1/auth/login", { email, password, clientType: "MOBILE" });
        const normalizedEmail = email.trim().toLowerCase();
        await persistence.save(version, tokens.refreshToken, normalizedEmail);
        setSession({ accessToken: tokens.accessToken, email: normalizedEmail, offline: false, version });
      },
      register: (email, displayName, password) => message("/api/v1/auth/register", { email, displayName, password }),
      async verify(email, code) {
        await message("/api/v1/auth/verify", { email, code });
      },
      resendVerification: (email) => message("/api/v1/auth/verify/resend", { email }),
      requestPasswordReset: (email) => message("/api/v1/auth/reset/request", { email }),
      completePasswordReset: (email, code, newPassword) => message("/api/v1/auth/reset/complete", { email, code, newPassword }),
      async request<T>(path: string, options: RequestInit = {}) {
        if (!session) throw new ApiError("Inicia sesión para continuar.", 401);
        const version = session.version;
        persistence.assert(version);
        let current = session.offline ? await refresh(version, session) : session;
        try {
          const result = await apiRequest<T>(path, options, current.accessToken);
          persistence.assert(version);
          return result;
        } catch (error) {
          persistence.assert(version);
          if (!(error instanceof ApiError) || error.status !== 401) {
            if (error instanceof ApiError && error.status == null && !current.offline) setSession({ ...current, offline: true });
            throw error;
          }
          current = await refresh(version, current);
          try {
            const result = await apiRequest<T>(path, options, current.accessToken);
            persistence.assert(version);
            return result;
          } catch (retryError) {
            if (retryError instanceof ApiError && retryError.status === 401) await invalidate(version);
            throw retryError;
          }
        }
      },
      async logout() {
        const previous = session;
        if (previous) persistence.assert(previous.version);
        const version = persistence.advance();
        rotation.current = null;
        setSession(null);
        await Promise.all([
          Platform.OS !== "web" ? persistence.clear(version) : Promise.resolve(),
          previous && !previous.offline ? apiRequest("/api/v1/auth/logout", { method: "POST" }, previous.accessToken) : Promise.resolve(),
        ]);
      },
    };
  }, [persistence, ready, rotate, session]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used within SessionProvider");
  return value;
}
