import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { Button, Card, Field, Heading, Notice, Page, palette, ui } from "@/components/ui";
import { ApiError, ClientProfile, ClientSession } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

type Mode = "login" | "register" | "verify" | "reset-request" | "reset-complete";

export default function AccountScreen() {
  const account = useSession();
  return <AccountContent key={account.session?.email ?? "guest"} {...account} />;
}

function AccountContent({ session, login, register, verify, resendVerification, requestPasswordReset, completePasswordReset, request, logout }: ReturnType<typeof useSession>) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [sessions, setSessions] = useState<ClientSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (!session) return () => { active = false; };
    void request<ClientProfile>("/api/v1/client/profile")
      .then((result) => {
        if (!active) return;
        setProfile(result); setProfileName(result.displayName); setProfilePhone(result.phone ?? ""); setError("");
      })
      .catch((reason) => {
        if (active) setError(reason instanceof ApiError ? reason.message : "No se pudo cargar tu perfil.");
      });
    return () => { active = false; };
  }, [request, session]);

  useEffect(() => {
    let active = true;
    if (!session) return () => { active = false; };
    void Promise.resolve().then(() => {
      if (active) setSessionsLoading(true);
      return request<ClientSession[]>("/api/v1/client/sessions");
    })
      .then((result) => { if (active) setSessions(result); })
      .catch((reason) => { if (active) setError(reason instanceof ApiError ? reason.message : "No se pudieron cargar tus sesiones."); })
      .finally(() => { if (active) setSessionsLoading(false); });
    return () => { active = false; };
  }, [request, session]);

  async function refreshSessions() {
    setSessionsLoading(true);
    try { setSessions(await request<ClientSession[]>("/api/v1/client/sessions")); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : "No se pudieron cargar tus sesiones."); }
    finally { setSessionsLoading(false); }
  }

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : "No se pudo completar la acción."); }
    finally { setBusy(false); }
  }

  async function submit() {
    if (mode === "login") return run(() => login(email.trim(), password));
    if (mode === "register") return run(async () => {
      const result = await register(email.trim(), name.trim(), password);
      setMessage(result); setMode("verify");
    });
    if (mode === "verify") return run(async () => {
      await verify(email.trim(), code.trim()); setMessage("Cuenta verificada. Ahora inicia sesión."); setMode("login"); setPassword("");
    });
    if (mode === "reset-request") return run(async () => {
      const result = await requestPasswordReset(email.trim());
      setMessage(result); setMode("reset-complete");
    });
    return run(async () => {
      const result = await completePasswordReset(email.trim(), code.trim(), password);
      setMessage(result); setMode("login"); setCode(""); setPassword("");
    });
  }

  const title: Record<Mode, string> = {
    login: "Inicia sesión", register: "Crear cuenta", verify: "Verificar cuenta",
    "reset-request": "Recuperar contraseña", "reset-complete": "Crear contraseña nueva",
  };
  const submitTitle: Record<Mode, string> = {
    login: "Entrar", register: "Crear cuenta", verify: "Verificar",
    "reset-request": "Enviar código", "reset-complete": "Actualizar contraseña",
  };

  if (session) return <ScrollView contentContainerStyle={{ flexGrow: 1 }}><Page><Heading eyebrow="Tu perfil">Mi cuenta</Heading>
    <Card><Text style={{ fontSize: 18, fontWeight: "800", color: palette.ink }}>Perfil Cliente</Text>
      <Text style={ui.body}>{profile?.email ?? session.email}</Text>
      {!profile && !error ? <Notice>Cargando tu perfil…</Notice> : null}
      {profile ? <>
        <Field label="Nombre" value={profileName} onChangeText={setProfileName} autoComplete="name" />
        <Field label="Teléfono (opcional)" value={profilePhone} onChangeText={setProfilePhone} keyboardType="phone-pad" autoComplete="tel" />
        {message ? <Notice tone="success">{message}</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Button title="Guardar perfil" secondary busy={busy} onPress={() => void run(async () => {
          setMessage("");
          const updated = await request<ClientProfile>("/api/v1/client/profile", {
            method: "PUT",
            body: JSON.stringify({ displayName: profileName.trim(), phone: profilePhone.trim(), expectedVersion: profile.version }),
          });
          setProfile(updated); setProfileName(updated.displayName); setProfilePhone(updated.phone ?? "");
          setMessage("Tus datos se guardaron correctamente.");
        })} />
      </> : null}
      <Button title="Administrar direcciones guardadas" secondary onPress={() => router.push("/addresses")} />
      <Notice>La sesión se valida con el backend WOK. Tu acceso está en memoria y el refresh token se almacena de forma segura.</Notice>
      {session.offline ? <Notice>Sin conexión: conservamos tu sesión y tus borradores en este dispositivo. Podrás reintentar las acciones del servidor cuando recuperes conexión.</Notice> : null}
      <View style={{ gap: 10 }}>
        <Text style={{ fontSize: 18, fontWeight: "800", color: palette.ink }}>Sesiones activas</Text>
        <Text style={ui.body}>Revisa dónde está abierta tu cuenta y cierra sesiones que no reconozcas.</Text>
        {sessionsLoading && sessions.length === 0 ? <Notice>Cargando sesiones…</Notice> : null}
        {!sessionsLoading && sessions.length === 0 ? <Notice>No hay sesiones activas disponibles.</Notice> : null}
        {sessions.map((item) => <View key={item.sessionId} style={{ borderWidth: 1, borderColor: palette.line, borderRadius: 12, padding: 12, gap: 6 }}>
          <Text style={{ color: palette.ink, fontWeight: "800" }}>{item.deviceName || sessionTypeLabel(item.clientType)}{item.current ? " · Este dispositivo" : ""}</Text>
          <Text style={ui.body}>Última actividad: {formatSessionDate(item.lastActivityAt)}</Text>
          {!item.current ? <Button title="Cerrar sesión" secondary busy={busy} onPress={() => void run(async () => {
            await request<void>(`/api/v1/client/sessions/${item.sessionId}`, { method: "DELETE" });
            setSessions((current) => current.filter((candidate) => candidate.sessionId !== item.sessionId));
            setMessage("La sesión se cerró correctamente.");
          })} /> : null}
        </View>)}
        <Button title="Actualizar sesiones" secondary busy={sessionsLoading} onPress={() => void refreshSessions()} />
      </View>
      <Button title="Cerrar sesión" secondary onPress={() => void run(async () => {
        await logout(); setProfile(null); setProfileName(""); setProfilePhone(""); setSessions([]); setMessage("");
      })} busy={busy} /></Card>
  </Page></ScrollView>;

  return <ScrollView contentContainerStyle={{ flexGrow: 1 }}><Page><Heading eyebrow="Acceso Cliente">{title[mode]}</Heading>
    <Text style={ui.body}>{mode === "reset-request" || mode === "reset-complete"
      ? "Te enviaremos un código si existe una cuenta activa con ese correo."
      : "Usa una cuenta Cliente de WOK. Las cuentas nuevas necesitan verificación por correo."}</Text>
    <Card>
      <Field label="Correo electrónico" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      {mode === "register" ? <Field label="Nombre" value={name} onChangeText={setName} autoComplete="name" /> : null}
      {mode === "login" || mode === "register" || mode === "reset-complete" ? <Field label={mode === "reset-complete" ? "Contraseña nueva" : "Contraseña"} value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === "login" ? "current-password" : "new-password"} /> : null}
      {mode === "verify" || mode === "reset-complete" ? <Field label="Código de 6 dígitos" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} /> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {mode === "register" || mode === "reset-complete" ? <Text style={ui.body}>La contraseña debe tener al menos 12 caracteres.</Text> : null}
      <Button title={submitTitle[mode]} onPress={() => void submit()} busy={busy} />
      {mode === "verify" ? <Button title="Reenviar código" secondary busy={busy} onPress={() => void run(async () => {
        setMessage(await resendVerification(email.trim()));
      })} /> : null}
    </Card>
    <View style={{ gap: 10 }}>
      {mode !== "login" ? <Text accessibilityRole="link" onPress={() => { setMode("login"); setError(""); setMessage(""); }} style={ui.link}>Ya tengo cuenta · Iniciar sesión</Text> : null}
      {mode === "login" ? <Text accessibilityRole="link" onPress={() => { setMode("reset-request"); setError(""); setMessage(""); }} style={ui.link}>Olvidé mi contraseña</Text> : null}
      {mode === "login" || mode === "verify" ? <Text accessibilityRole="link" onPress={() => { setMode("register"); setError(""); setMessage(""); }} style={ui.link}>Crear cuenta Cliente</Text> : null}
    </View>
  </Page></ScrollView>;
}

function sessionTypeLabel(clientType: ClientSession["clientType"]) {
  if (clientType === "MOBILE") return "Aplicación móvil";
  if (clientType === "WEB") return "Navegador web";
  return "Dispositivo de escritorio";
}

function formatSessionDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "No disponible" : date.toLocaleString("es-GT", { dateStyle: "medium", timeStyle: "short" });
}
