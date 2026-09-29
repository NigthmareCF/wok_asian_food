import * as SecureStore from "expo-secure-store";
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import { ApiError, apiRequest, TokenPair } from "@/lib/api";

type Session = { accessToken: string; email: string };
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
const refreshKey = "wok.refresh-token";
let refreshInFlight: Promise<TokenPair> | null = null;

function rotateRefreshToken(refreshToken: string) {
  if (!refreshInFlight) {
    refreshInFlight = apiRequest<TokenPair>("/api/v1/auth/refresh", {
      method: "POST", body: JSON.stringify({ refreshToken }),
    }).finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function restore() {
      if (Platform.OS === "web") { setReady(true); return; }
      try {
        const refreshToken = await SecureStore.getItemAsync(refreshKey);
        if (refreshToken && process.env.EXPO_PUBLIC_API_BASE_URL) {
          const tokens = await rotateRefreshToken(refreshToken);
          await SecureStore.setItemAsync(refreshKey, tokens.refreshToken);
          if (mounted) setSession({ accessToken: tokens.accessToken, email: "Cuenta Cliente" });
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) await SecureStore.deleteItemAsync(refreshKey);
        // Keep the refresh token after network failures so the customer can retry.
      } finally { if (mounted) setReady(true); }
    }
    void restore();
    return () => { mounted = false; };
  }, []);

  const value = useMemo<SessionContextValue>(() => ({
    session,
    ready,
    async login(email, password) {
      if (Platform.OS === "web") throw new ApiError("Inicia sesión desde la aplicación móvil para proteger tu sesión.");
      const tokens = await apiRequest<TokenPair>("/api/v1/auth/login", {
        method: "POST", body: JSON.stringify({ email, password, clientType: "MOBILE" }),
      });
      await SecureStore.setItemAsync(refreshKey, tokens.refreshToken);
      setSession({ accessToken: tokens.accessToken, email });
    },
    async register(email, displayName, password) {
      const result = await apiRequest<{ message: string }>("/api/v1/auth/register", {
        method: "POST", body: JSON.stringify({ email, displayName, password }),
      });
      return result.message;
    },
    async verify(email, code) {
      await apiRequest("/api/v1/auth/verify", { method: "POST", body: JSON.stringify({ email, code }) });
    },
    async resendVerification(email) {
      const result = await apiRequest<{ message: string }>("/api/v1/auth/verify/resend", {
        method: "POST", body: JSON.stringify({ email }),
      });
      return result.message;
    },
    async requestPasswordReset(email) {
      const result = await apiRequest<{ message: string }>("/api/v1/auth/reset/request", {
        method: "POST", body: JSON.stringify({ email }),
      });
      return result.message;
    },
    async completePasswordReset(email, code, newPassword) {
      const result = await apiRequest<{ message: string }>("/api/v1/auth/reset/complete", {
        method: "POST", body: JSON.stringify({ email, code, newPassword }),
      });
      return result.message;
    },
    async request<T>(path: string, options: RequestInit = {}) {
      if (!session) throw new ApiError("Inicia sesión para continuar.", 401);
      try { return await apiRequest<T>(path, options, session.accessToken); }
      catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
        const refreshToken = await SecureStore.getItemAsync(refreshKey);
        if (!refreshToken) { setSession(null); throw error; }
        const rotated = await rotateRefreshToken(refreshToken);
        await SecureStore.setItemAsync(refreshKey, rotated.refreshToken);
        const nextSession = { accessToken: rotated.accessToken, email: session.email };
        setSession(nextSession);
        return apiRequest<T>(path, options, nextSession.accessToken);
      }
    },
    async logout() {
      if (Platform.OS === "web") { setSession(null); return; }
      if (session) {
        try { await apiRequest("/api/v1/auth/logout", { method: "POST" }, session.accessToken); }
        finally { setSession(null); await SecureStore.deleteItemAsync(refreshKey); }
      } else {
        setSession(null);
        await SecureStore.deleteItemAsync(refreshKey);
      }
    },
  }), [ready, session]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used within SessionProvider");
  return value;
}
