import * as SecureStore from "expo-secure-store";
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import { ApiError, apiRequest, TokenPair } from "@/lib/api";

type Session = { accessToken: string; email: string; offline: boolean };
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
const emailKey = "wok.session-email";
let refreshInFlight: Promise<TokenPair> | null = null;
let recentRefreshRotation: { previousToken: string; tokens: TokenPair; expiresAt: number } | null = null;

function rotateRefreshToken(refreshToken: string) {
  if (recentRefreshRotation?.previousToken === refreshToken && recentRefreshRotation.expiresAt > Date.now()) {
    return Promise.resolve(recentRefreshRotation.tokens);
  }
  if (!refreshInFlight) {
    refreshInFlight = apiRequest<TokenPair>("/api/v1/auth/refresh", {
      method: "POST", body: JSON.stringify({ refreshToken }),
    }).then((tokens) => {
      recentRefreshRotation = { previousToken: refreshToken, tokens, expiresAt: Date.now() + 30_000 };
      return tokens;
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
        const [refreshToken, storedEmail] = await Promise.all([
          SecureStore.getItemAsync(refreshKey), SecureStore.getItemAsync(emailKey),
        ]);
        if (refreshToken) {
          const email = storedEmail || "Cuenta Cliente";
          if (!process.env.EXPO_PUBLIC_API_BASE_URL) {
            if (mounted) setSession({ accessToken: "", email, offline: true });
            return;
          }
          const tokens = await rotateRefreshToken(refreshToken);
          await SecureStore.setItemAsync(refreshKey, tokens.refreshToken);
          if (mounted) setSession({ accessToken: tokens.accessToken, email, offline: false });
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await Promise.all([SecureStore.deleteItemAsync(refreshKey), SecureStore.deleteItemAsync(emailKey)]);
        } else {
          const email = await SecureStore.getItemAsync(emailKey);
          if (mounted && email) setSession({ accessToken: "", email, offline: true });
          // Keep the refresh token after network failures so the customer can retry.
        }
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
      const normalizedEmail = email.trim().toLowerCase();
      await SecureStore.setItemAsync(emailKey, normalizedEmail);
      recentRefreshRotation = null;
      setSession({ accessToken: tokens.accessToken, email: normalizedEmail, offline: false });
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
      let activeSession = session;
      if (session.offline) {
        const refreshToken = await SecureStore.getItemAsync(refreshKey);
        if (!refreshToken) {
          setSession(null);
          await SecureStore.deleteItemAsync(emailKey);
          throw new ApiError("La sesión ya no está disponible. Inicia sesión nuevamente.", 401);
        }
        try {
          const rotated = await rotateRefreshToken(refreshToken);
          await SecureStore.setItemAsync(refreshKey, rotated.refreshToken);
          activeSession = { accessToken: rotated.accessToken, email: session.email, offline: false };
          setSession(activeSession);
        } catch (refreshError) {
          if (refreshError instanceof ApiError && refreshError.status === 401) {
            setSession(null);
            await Promise.all([SecureStore.deleteItemAsync(refreshKey), SecureStore.deleteItemAsync(emailKey)]);
          }
          throw refreshError;
        }
      }
      try { return await apiRequest<T>(path, options, activeSession.accessToken); }
      catch (error) {
        if (!(error instanceof ApiError)) throw error;
        if (error.status !== 401) {
          if (error.status == null) setSession({ ...activeSession, offline: true });
          throw error;
        }
        const refreshToken = await SecureStore.getItemAsync(refreshKey);
        if (!refreshToken) {
          setSession(null);
          await SecureStore.deleteItemAsync(emailKey);
          throw error;
        }
        let rotated: TokenPair;
        try {
          rotated = await rotateRefreshToken(refreshToken);
        } catch (refreshError) {
          if (refreshError instanceof ApiError && refreshError.status === 401) {
            setSession(null);
            await Promise.all([SecureStore.deleteItemAsync(refreshKey), SecureStore.deleteItemAsync(emailKey)]);
          } else if (refreshError instanceof ApiError && refreshError.status == null) {
            setSession({ ...activeSession, offline: true });
          }
          throw refreshError;
        }
        await SecureStore.setItemAsync(refreshKey, rotated.refreshToken);
        const nextSession = { accessToken: rotated.accessToken, email: session.email, offline: false };
        setSession(nextSession);
        try { return await apiRequest<T>(path, options, nextSession.accessToken); }
        catch (retryError) {
          if (retryError instanceof ApiError && retryError.status === 401) {
            setSession(null);
            await Promise.all([SecureStore.deleteItemAsync(refreshKey), SecureStore.deleteItemAsync(emailKey)]);
          }
          throw retryError;
        }
      }
    },
    async logout() {
      recentRefreshRotation = null;
      if (Platform.OS === "web") { setSession(null); return; }
      if (session) {
        try {
          if (!session.offline) await apiRequest("/api/v1/auth/logout", { method: "POST" }, session.accessToken);
        } finally {
          setSession(null);
          await Promise.all([SecureStore.deleteItemAsync(refreshKey), SecureStore.deleteItemAsync(emailKey)]);
        }
      } else {
        setSession(null);
        await Promise.all([SecureStore.deleteItemAsync(refreshKey), SecureStore.deleteItemAsync(emailKey)]);
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
