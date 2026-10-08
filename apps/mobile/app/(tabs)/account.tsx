import { useCallback, useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Heading,
  Notice,
  Page,
  Skeleton,
} from "@/components/ui";
import { Brand } from "@/components/brand";
import { ApiError, ClientProfile, ClientSession } from "@/lib/api";
import {
  clientProfileSchema,
  clientSessionsSchema,
  emailSchema,
  formatGuatemalaPhoneInput,
  identitySchemas,
  IdentityMode,
  IdentityValues,
  profileSchema,
} from "@/lib/identity";
import { useSession } from "@/providers/session-provider";

const titles: Record<IdentityMode, string> = {
  login: "Inicia sesión",
  register: "Crear cuenta",
  verify: "Verificar cuenta",
  "reset-request": "Recuperar contraseña",
  "reset-complete": "Crear contraseña nueva",
};
const submitTitles: Record<IdentityMode, string> = {
  login: "Entrar",
  register: "Crear cuenta",
  verify: "Verificar",
  "reset-request": "Enviar código",
  "reset-complete": "Actualizar contraseña",
};
const failureMessage = (reason: unknown) =>
  reason instanceof ApiError
    ? reason.message
    : "No se pudo completar la acción.";

export default function AccountScreen() {
  const { session, ready } = useSession();
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ flexGrow: 1 }}
    >
      <Page safeTop brand={!ready || Boolean(session)}>
        {!ready ? (
          <>
            <Heading eyebrow="Acceso Cliente">Mi cuenta</Heading>
            <Notice>Comprobando tu sesión…</Notice>
          </>
        ) : session ? (
          <ProfilePanel
            key={session.email}
            email={session.email}
            offline={session.offline}
          />
        ) : (
          <IdentityForm />
        )}
      </Page>
    </ScrollView>
  );
}

function IdentityForm() {
  const {
    login,
    register,
    verify,
    resendVerification,
    requestPasswordReset,
    completePasswordReset,
  } = useSession();
  const [mode, setMode] = useState<IdentityMode>("login");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const locked = useRef(false);
  const {
    control,
    handleSubmit,
    getValues,
    resetField,
    clearErrors,
    setError: setFieldError,
    setFocus,
  } = useForm<IdentityValues>({
    defaultValues: { email: "", name: "", password: "", code: "" },
  });

  function changeMode(next: IdentityMode, keepMessage = false) {
    if (locked.current && !keepMessage) return;
    resetField("password");
    resetField("code");
    clearErrors();
    setError("");
    if (!keepMessage) setMessage("");
    setMode(next);
  }
  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (reason) {
      setError(failureMessage(reason));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function submit() {
    await handleSubmit(async (values) => {
      if (locked.current) return;
      clearErrors();
      const result = identitySchemas[mode].safeParse(values);
      if (!result.success) {
        for (const issue of result.error.issues)
          setFieldError(issue.path[0] as keyof IdentityValues, {
            message: issue.message,
          });
        setFocus(result.error.issues[0].path[0] as keyof IdentityValues);
        return;
      }
      const { email, name, password, code } = result.data;
      await run(async () => {
        if (mode === "login") {
          await login(email, password);
          resetField("password");
          return;
        }
        if (mode === "register") {
          setMessage(await register(email, name, password));
          changeMode("verify", true);
          return;
        }
        if (mode === "verify") {
          await verify(email, code);
          setMessage("Cuenta verificada. Ahora inicia sesión.");
          changeMode("login", true);
          return;
        }
        if (mode === "reset-request") {
          setMessage(await requestPasswordReset(email));
          changeMode("reset-complete", true);
          return;
        }
        setMessage(await completePasswordReset(email, code, password));
        changeMode("login", true);
      });
    })();
  }

  return (
    <>
      <Brand compact />
      <Heading eyebrow="Tu mesa empieza aquí">{titles[mode]}</Heading>
      <Text className="font-sans text-base leading-6 text-muted-foreground">
        {mode.startsWith("reset")
          ? "Te enviaremos un código si existe una cuenta activa con ese correo."
          : "Usa una cuenta Cliente de WOK. Las cuentas nuevas necesitan verificación por correo."}
      </Text>
      <Card>
        <Controller
          control={control}
          name="email"
          render={({ field, fieldState }) => (
            <>
              <Field
                error={fieldState.error?.message}
                ref={field.ref}
                icon={{ ios: "envelope", android: "mail", web: "mail" }}
                label="Correo electrónico"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                maxLength={254}
                editable={!busy}
              />
            </>
          )}
        />
        {mode === "register" ? (
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState }) => (
              <>
                <Field
                  error={fieldState.error?.message}
                  ref={field.ref}
                  icon={{ ios: "person", android: "person", web: "person" }}
                  label="Nombre"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  autoComplete="name"
                  maxLength={100}
                  editable={!busy}
                />
              </>
            )}
          />
        ) : null}
        {mode === "login" ||
        mode === "register" ||
        mode === "reset-complete" ? (
          <Controller
            control={control}
            name="password"
            render={({ field, fieldState }) => (
              <>
                <Field
                  error={fieldState.error?.message}
                  ref={field.ref}
                  icon={{ ios: "lock", android: "lock", web: "lock" }}
                  label={
                    mode === "reset-complete"
                      ? "Contraseña nueva"
                      : "Contraseña"
                  }
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={128}
                  editable={!busy}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                />
              </>
            )}
          />
        ) : null}
        {mode === "verify" || mode === "reset-complete" ? (
          <Controller
            control={control}
            name="code"
            render={({ field, fieldState }) => (
              <>
                <Field
                  error={fieldState.error?.message}
                  ref={field.ref}
                  icon={{ ios: "number", android: "pin", web: "pin" }}
                  label="Código de 6 dígitos"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  maxLength={6}
                  editable={!busy}
                />
              </>
            )}
          />
        ) : null}
        {mode === "register" || mode === "reset-complete" ? (
          <Text className="font-sans text-sm leading-5 text-muted-foreground">
            Usa 12 a 128 caracteres, mayúscula, minúscula, número y símbolo, sin
            espacios.
          </Text>
        ) : null}
        {message ? <Notice tone="success">{message}</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Button
          title={submitTitles[mode]}
          onPress={() => void submit()}
          busy={busy}
        />
        {mode === "verify" ? (
          <Button
            title="Reenviar código"
            secondary
            busy={busy}
            onPress={() => {
              const result = emailSchema.safeParse(getValues("email"));
              if (!result.success) {
                setFieldError("email", {
                  message: "Ingresa un correo válido.",
                });
                setFocus("email");
                return;
              }
              void run(async () => {
                setMessage(await resendVerification(result.data));
              });
            }}
          />
        ) : null}
      </Card>
      <View className="gap-3">
        {mode !== "login" ? (
          <Button
            title="Ya tengo cuenta · Iniciar sesión"
            secondary
            disabled={busy}
            onPress={() => changeMode("login")}
          />
        ) : null}
        {mode === "login" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => changeMode("reset-request")}
            className="min-h-11 justify-center rounded-md focus:ring-2 focus:ring-ring"
          >
            <Text className="text-center font-sans text-sm font-bold text-primary">
              Olvidé mi contraseña
            </Text>
          </Pressable>
        ) : null}
        {mode === "login" || mode === "verify" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => changeMode("register")}
            className="min-h-11 justify-center rounded-md focus:ring-2 focus:ring-ring"
          >
            <Text className="text-center font-sans text-base font-bold text-foreground">
              ¿Aún no tienes cuenta? Crear cuenta
            </Text>
          </Pressable>
        ) : null}
        {mode === "login" ? (
          <>
            <Button
              title="Continuar con Google"
              secondary
              disabled
              onPress={() => {}}
            />
            <Text className="font-sans text-sm text-muted-foreground">
              Google estará disponible cuando su configuración esté lista.
            </Text>
          </>
        ) : null}
      </View>
    </>
  );
}

function ProfilePanel({ email, offline }: { email: string; offline: boolean }) {
  const { request, logout } = useSession();
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [sessions, setSessions] = useState<ClientSession[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const locked = useRef(false);
  const {
    control,
    handleSubmit,
    reset,
    clearErrors,
    setError: setFieldError,
    setFocus,
    getFieldState,
  } = useForm<{ displayName: string; phone: string }>({
    defaultValues: { displayName: "", phone: "" },
  });

  const load = useCallback(
    async (active: () => boolean = () => true) => {
      setLoading(true);
      setError("");
      const results = await Promise.allSettled([
        request<unknown>("/api/v1/client/profile").then((data) => {
          const result = clientProfileSchema.safeParse(data);
          if (!result.success)
            throw new ApiError("No pudimos validar tu perfil.", 503);
          return result.data;
        }),
        request<unknown>("/api/v1/client/sessions").then((data) => {
          const result = clientSessionsSchema.safeParse(data);
          if (!result.success)
            throw new ApiError("No pudimos validar tus sesiones.", 503);
          return result.data;
        }),
      ]);
      if (!active()) return;
      const [profileResult, sessionsResult] = results;
      if (profileResult.status === "fulfilled") {
        setProfile(profileResult.value);
        if (
          !getFieldState("displayName").isDirty &&
          !getFieldState("phone").isDirty
        ) {
          reset({
            displayName: profileResult.value.displayName,
            phone: formatGuatemalaPhoneInput(profileResult.value.phone ?? ""),
          });
        }
      } else setError(failureMessage(profileResult.reason));
      if (sessionsResult.status === "fulfilled") {
        setSessions(sessionsResult.value);
        setSessionsLoaded(true);
      } else setError(failureMessage(sessionsResult.reason));
      setLoading(false);
    },
    [getFieldState, request, reset],
  );

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      if (offline) {
        setLoading(false);
        return;
      }
      return load(() => active);
    });
    return () => {
      active = false;
    };
  }, [load, offline]);

  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (reason) {
      setError(failureMessage(reason));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function save() {
    await handleSubmit(async (values) => {
      clearErrors();
      const result = profileSchema.safeParse(values);
      if (!result.success) {
        for (const issue of result.error.issues)
          setFieldError(issue.path[0] as "displayName" | "phone", {
            message: issue.message,
          });
        setFocus(result.error.issues[0].path[0] as "displayName" | "phone");
        return;
      }
      if (!profile) return;
      await run(async () => {
        const response = await request<unknown>("/api/v1/client/profile", {
          method: "PUT",
          body: JSON.stringify({
            ...result.data,
            expectedVersion: profile.version,
          }),
        });
        const parsed = clientProfileSchema.safeParse(response);
        if (!parsed.success)
          throw new ApiError(
            "No pudimos validar el perfil guardado. Actualiza la información antes de reintentar.",
            503,
          );
        const updated = parsed.data;
        setProfile(updated);
        reset({
          displayName: updated.displayName,
          phone: formatGuatemalaPhoneInput(updated.phone ?? ""),
        });
        setMessage("Tus datos se guardaron correctamente.");
      });
    })();
  }

  return (
    <>
      <Heading eyebrow="Tu perfil">Mi cuenta</Heading>
      <Card>
        <Text className="font-sans text-xl font-extrabold text-foreground">
          Perfil Cliente
        </Text>
        <Text className="font-sans text-base text-muted-foreground">
          {email}
        </Text>
        {loading ? (
          <View
            accessibilityLabel="Cargando perfil y sesiones"
            className="gap-3"
          >
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Notice>Cargando tu perfil y sesiones…</Notice>
          </View>
        ) : null}
        {profile ? (
          <>
            <Controller
              control={control}
              name="displayName"
              render={({ field, fieldState }) => (
                <>
                  <Field
                    error={fieldState.error?.message}
                    ref={field.ref}
                    icon={{ ios: "person", android: "person", web: "person" }}
                    label="Nombre"
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    autoComplete="name"
                    maxLength={100}
                    editable={!busy}
                  />
                </>
              )}
            />
            <Controller
              control={control}
              name="phone"
              render={({ field, fieldState }) => (
                <>
                  <Field
                    error={fieldState.error?.message}
                    ref={field.ref}
                    icon={{ ios: "phone", android: "phone", web: "phone" }}
                    label="Teléfono (opcional)"
                    value={field.value}
                    onChangeText={(value) =>
                      field.onChange(formatGuatemalaPhoneInput(value))
                    }
                    onBlur={field.onBlur}
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    maxLength={9}
                    editable={!busy}
                  />
                </>
              )}
            />
            <Button
              title="Guardar perfil"
              onPress={() => void save()}
              busy={busy}
              disabled={loading}
            />
          </>
        ) : null}
        {message ? <Notice tone="success">{message}</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        {offline ? (
          <Notice>
            Sin conexión. Tu sesión se conserva, pero los cambios requieren
            respuesta del servidor y no se envían automáticamente.
          </Notice>
        ) : null}
        <Button
          title="Actualizar perfil y sesiones"
          secondary
          busy={loading}
          disabled={busy}
          onPress={() => void load()}
        />
        <Text
          accessibilityRole="header"
          className="font-sans text-xl font-extrabold text-foreground"
        >
          {offline || error
            ? "Últimas sesiones consultadas"
            : "Sesiones activas"}
        </Text>
        {sessionsLoaded &&
        !loading &&
        !error &&
        !offline &&
        sessions.length === 0 ? (
          <EmptyState
            title="Sin sesiones para mostrar"
            description="Aquí aparecerán los dispositivos con acceso activo a tu cuenta."
            icon={{
              ios: "person.crop.circle",
              android: "devices",
              web: "devices",
            }}
          />
        ) : null}
        {sessions.map((item) => (
          <Card key={item.sessionId}>
            <Text className="font-sans text-base font-bold text-foreground">
              {item.deviceName || sessionTypeLabel(item.clientType)}
              {item.current ? " · Este dispositivo" : ""}
            </Text>
            <Text className="font-sans text-sm text-muted-foreground">
              Última actividad: {formatSessionDate(item.lastActivityAt)}
            </Text>
            {!item.current ? (
              <Button
                title="Cerrar esta sesión"
                accessibilityLabel={`Cerrar sesión de ${item.deviceName || sessionTypeLabel(item.clientType)}`}
                secondary
                busy={busy}
                onPress={() =>
                  void run(async () => {
                    await request<void>(
                      `/api/v1/client/sessions/${item.sessionId}`,
                      { method: "DELETE" },
                    );
                    setSessions((current) =>
                      current.filter(
                        (candidate) => candidate.sessionId !== item.sessionId,
                      ),
                    );
                    setMessage("La sesión se cerró correctamente.");
                  })
                }
              />
            ) : null}
          </Card>
        ))}
        <Button
          title="Cerrar sesión"
          secondary
          busy={busy}
          onPress={() => void run(logout)}
        />
      </Card>
    </>
  );
}

function sessionTypeLabel(clientType: ClientSession["clientType"]) {
  return clientType === "MOBILE"
    ? "Aplicación móvil"
    : clientType === "WEB"
      ? "Navegador web"
      : "Dispositivo de escritorio";
}
function formatSessionDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "No disponible"
    : date.toLocaleString("es-GT", { dateStyle: "medium", timeStyle: "short" });
}
