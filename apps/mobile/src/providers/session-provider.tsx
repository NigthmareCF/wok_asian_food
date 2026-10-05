import * as SecureStore from "expo-secure-store";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { ApiError, apiRequest, TokenPair } from "@/lib/api";
import { completeGoogleSignIn } from "@/lib/google-auth";
import { createRefreshTokenCoordinator, createSerializedWriteQueue } from "@/lib/session-coordination";

type Session = { accessToken: string; email: string; offline: boolean };
type SessionContextValue = {
  session: Session | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  linkGoogle: () => Promise<void>;
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
const refreshCoordinator = createRefreshTokenCoordinator<TokenPair>((refreshToken) =>
  apiRequest<TokenPair>("/api/v1/auth/refresh", {
    method: "POST", body: JSON.stringify({ refreshToken }),
  }),
);
const serializeSecureStoreWrite = createSerializedWriteQueue();

function getGoogleWebClientId() {
  if (Platform.OS === "web") throw new ApiError("El acceso con Google está disponible en la aplicación móvil.");
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    throw new ApiError("Google requiere la versión de desarrollo de WOK; Expo Go no incluye el módulo nativo.");
  }
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  const iosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME?.trim();
  if (!webClientId || !iosUrlScheme || Constants.expoConfig?.extra?.googleSignInEnabled !== true) {
    throw new ApiError("El acceso con Google aún no está configurado para esta instalación.");
  }
  return webClientId;
}

async function getNativeGoogleIdentity(nonce: string, webClientId: string) {
  const { GoogleOneTapSignIn, isCancelledResponse, isNoSavedCredentialFoundResponse, isSuccessResponse } =
    await import("react-native-nitro-google-signin");
  GoogleOneTapSignIn.configure({ webClientId, nonce, offlineAccess: false, scopes: ["email", "profile"] });
  if (Platform.OS === "android") await GoogleOneTapSignIn.checkPlayServices();
  let response = await GoogleOneTapSignIn.signIn();
  if (isNoSavedCredentialFoundResponse(response)) response = await GoogleOneTapSignIn.createAccount();
  if (isCancelledResponse(response)) return null;
  if (!isSuccessResponse(response) || !response.data.idToken || !response.data.user.email) {
    throw new ApiError("Google no devolvió una identidad verificable. Inténtalo de nuevo.");
  }
  return { idToken: response.data.idToken, email: response.data.user.email };
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const authGeneration = useRef(0);

  function saveTokens(tokens: TokenPair, email: string, generation: number) {
    return serializeSecureStoreWrite(async () => {
      if (generation !== authGeneration.current) return false;
      await Promise.all([
        SecureStore.setItemAsync(refreshKey, tokens.refreshToken),
        SecureStore.setItemAsync(emailKey, email),
      ]);
      return true;
    });
  }

  function clearStoredSession(generation: number) {
    return serializeSecureStoreWrite(async () => {
      if (generation !== authGeneration.current) return false;
      await Promise.all([SecureStore.deleteItemAsync(refreshKey), SecureStore.deleteItemAsync(emailKey)]);
      return true;
    });
  }

  useEffect(() => {
    let mounted = true;
    async function restore() {
      const generation = authGeneration.current;
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
          const tokens = await refreshCoordinator.rotate(refreshToken);
          if (generation !== authGeneration.current) return;
          const saved = await saveTokens(tokens, email, generation);
          if (mounted && saved && generation === authGeneration.current) setSession({ accessToken: tokens.accessToken, email, offline: false });
        }
      } catch (error) {
        if (generation !== authGeneration.current) return;
        if (error instanceof ApiError && error.status === 401) {
          authGeneration.current += 1;
          await clearStoredSession(authGeneration.current);
        } else {
          const email = await SecureStore.getItemAsync(emailKey);
          if (mounted && generation === authGeneration.current && email) setSession({ accessToken: "", email, offline: true });
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
      const normalizedEmail = email.trim().toLowerCase();
      authGeneration.current += 1;
      const generation = authGeneration.current;
      const saved = await saveTokens(tokens, normalizedEmail, generation);
      if (!saved || generation !== authGeneration.current) throw new ApiError("La sesión cambió antes de completar el acceso. Inicia sesión nuevamente.", 401);
      refreshCoordinator.clear();
      setSession({ accessToken: tokens.accessToken, email: normalizedEmail, offline: false });
    },
    async loginWithGoogle() {
      const webClientId = getGoogleWebClientId();
      const authenticated = await completeGoogleSignIn({
        issueNonce: () => apiRequest("/api/v1/auth/google/nonce", { method: "POST" }),
        getIdentity: (nonce) => getNativeGoogleIdentity(nonce, webClientId),
        async exchange({ idToken }, nonce) {
          try {
            return await apiRequest<TokenPair>("/api/v1/auth/google", {
              method: "POST",
              body: JSON.stringify({ idToken, nonce, clientType: "MOBILE" }),
            });
          } catch (error) {
            if (error instanceof ApiError && error.status === 409) {
              throw new ApiError("Primero inicia sesión con tu cuenta WOK y vincula Google desde Mi cuenta.", 409);
            }
            throw error;
          }
        },
      });
      if (!authenticated) return;
      const { value: tokens, email: normalizedEmail } = authenticated;
      authGeneration.current += 1;
      const generation = authGeneration.current;
      const saved = await saveTokens(tokens, normalizedEmail, generation);
      if (!saved || generation !== authGeneration.current) throw new ApiError("La sesión cambió antes de completar el acceso. Inicia sesión nuevamente.", 401);
      refreshCoordinator.clear();
      setSession({ accessToken: tokens.accessToken, email: normalizedEmail, offline: false });
    },
    async linkGoogle() {
      if (!session || session.offline) throw new ApiError("Conéctate con tu cuenta WOK para vincular Google.", 401);
      const webClientId = getGoogleWebClientId();
      const generation = authGeneration.current;
      try {
        const linked = await completeGoogleSignIn<{ message: string }>({
          issueNonce: () => apiRequest("/api/v1/auth/google/nonce", { method: "POST" }),
          getIdentity: (nonce) => getNativeGoogleIdentity(nonce, webClientId),
          exchange: ({ idToken }, nonce) => apiRequest<{ message: string }>("/api/v1/auth/google/link", {
            method: "POST",
            body: JSON.stringify({ idToken, nonce }),
          }, session.accessToken),
        });
        if (generation !== authGeneration.current) throw new ApiError("La sesión cambió. Inicia sesión nuevamente.", 401);
        if (!linked) return;
      } catch (error) {
        if (error instanceof ApiError && error.status === 403) {
          throw new ApiError("El correo verificado de Google debe coincidir con el de tu cuenta WOK.", 403);
        }
        if (error instanceof ApiError && error.status === 409) {
          throw new ApiError("Esta cuenta Google ya está vinculada a otra cuenta WOK.", 409);
        }
        throw error;
      }
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
      const requestGeneration = authGeneration.current;
      let activeSession = session;
      if (session.offline) {
        const refreshToken = await SecureStore.getItemAsync(refreshKey);
        if (!refreshToken) {
          authGeneration.current += 1;
          setSession(null);
          await clearStoredSession(authGeneration.current);
          throw new ApiError("La sesión ya no está disponible. Inicia sesión nuevamente.", 401);
        }
        try {
          const rotated = await refreshCoordinator.rotate(refreshToken);
          if (authGeneration.current !== requestGeneration) throw new ApiError("La sesión cambió. Repite la acción con tu cuenta actual.", 401);
          const saved = await saveTokens(rotated, session.email, requestGeneration);
          if (!saved || authGeneration.current !== requestGeneration) throw new ApiError("La sesión cambió. Repite la acción con tu cuenta actual.", 401);
          activeSession = { accessToken: rotated.accessToken, email: session.email, offline: false };
          setSession(activeSession);
        } catch (refreshError) {
          if (authGeneration.current !== requestGeneration) throw new ApiError("La sesión cambió. Repite la acción con tu cuenta actual.", 401);
          if (refreshError instanceof ApiError && refreshError.status === 401) {
            authGeneration.current += 1;
            setSession(null);
            await clearStoredSession(authGeneration.current);
          }
          throw refreshError;
        }
      }
      try {
        const result = await apiRequest<T>(path, options, activeSession.accessToken);
        if (authGeneration.current !== requestGeneration) throw new ApiError("La sesión cambió. Repite la acción con tu cuenta actual.", 401);
        return result;
      }
      catch (error) {
        if (authGeneration.current !== requestGeneration) throw new ApiError("La sesión cambió. Repite la acción con tu cuenta actual.", 401);
        if (!(error instanceof ApiError)) throw error;
        if (error.status !== 401) {
          if (error.status == null) setSession({ ...activeSession, offline: true });
          throw error;
        }
        const refreshToken = await SecureStore.getItemAsync(refreshKey);
        if (authGeneration.current !== requestGeneration) throw new ApiError("La sesión cambió. Repite la acción con tu cuenta actual.", 401);
        if (!refreshToken) {
          authGeneration.current += 1;
          setSession(null);
          await clearStoredSession(authGeneration.current);
          throw error;
        }
        let rotated: TokenPair;
        try {
          rotated = await refreshCoordinator.rotate(refreshToken);
        } catch (refreshError) {
          if (authGeneration.current !== requestGeneration) throw new ApiError("La sesión cambió. Repite la acción con tu cuenta actual.", 401);
          if (refreshError instanceof ApiError && refreshError.status === 401) {
            authGeneration.current += 1;
            setSession(null);
            await clearStoredSession(authGeneration.current);
          } else if (refreshError instanceof ApiError && refreshError.status == null) {
            setSession({ ...activeSession, offline: true });
          }
          throw refreshError;
        }
        if (authGeneration.current !== requestGeneration) throw new ApiError("La sesión cambió. Repite la acción con tu cuenta actual.", 401);
        const saved = await saveTokens(rotated, session.email, requestGeneration);
        if (!saved || authGeneration.current !== requestGeneration) throw new ApiError("La sesión cambió. Repite la acción con tu cuenta actual.", 401);
        const nextSession = { accessToken: rotated.accessToken, email: session.email, offline: false };
        setSession(nextSession);
        try {
          const result = await apiRequest<T>(path, options, nextSession.accessToken);
          if (authGeneration.current !== requestGeneration) throw new ApiError("La sesión cambió. Repite la acción con tu cuenta actual.", 401);
          return result;
        }
        catch (retryError) {
          if (authGeneration.current !== requestGeneration) throw new ApiError("La sesión cambió. Repite la acción con tu cuenta actual.", 401);
          if (retryError instanceof ApiError && retryError.status === 401) {
            authGeneration.current += 1;
            setSession(null);
            await clearStoredSession(authGeneration.current);
          }
          throw retryError;
        }
      }
    },
    async logout() {
      authGeneration.current += 1;
      const logoutGeneration = authGeneration.current;
      refreshCoordinator.clear();
      if (Platform.OS === "web") { if (logoutGeneration === authGeneration.current) setSession(null); return; }
      if (session) {
        try {
          if (!session.offline) await apiRequest("/api/v1/auth/logout", { method: "POST" }, session.accessToken);
        } finally {
          if (logoutGeneration === authGeneration.current) setSession(null);
          await clearStoredSession(logoutGeneration);
        }
      } else {
        if (logoutGeneration === authGeneration.current) setSession(null);
        await clearStoredSession(logoutGeneration);
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
