import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Button, Card, Field, Heading, Notice, Page, palette, ui } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

type Mode = "login" | "register" | "verify";

export default function AccountScreen() {
  const { session, login, register, verify, logout } = useSession();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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
    return run(async () => {
      await verify(email.trim(), code.trim()); setMessage("Cuenta verificada. Ahora inicia sesión."); setMode("login"); setPassword("");
    });
  }

  if (session) return <ScrollView contentContainerStyle={{ flexGrow: 1 }}><Page><Heading eyebrow="Tu perfil">Mi cuenta</Heading>
    <Card><Text style={{ fontSize: 18, fontWeight: "800", color: palette.ink }}>Sesión activa</Text><Text style={ui.body}>{session.email}</Text><Notice>La sesión se valida con el backend WOK. Tu acceso está en memoria y el refresh token se almacena de forma segura.</Notice><Button title="Cerrar sesión" secondary onPress={() => void run(logout)} busy={busy} /></Card>
  </Page></ScrollView>;

  return <ScrollView contentContainerStyle={{ flexGrow: 1 }}><Page><Heading eyebrow="Acceso Cliente">{mode === "login" ? "Inicia sesión" : mode === "register" ? "Crear cuenta" : "Verificar cuenta"}</Heading>
    <Text style={ui.body}>Usa una cuenta Cliente de WOK. Las cuentas nuevas necesitan verificación por correo.</Text>
    <Card>
      <Field label="Correo electrónico" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      {mode === "register" ? <Field label="Nombre" value={name} onChangeText={setName} autoComplete="name" /> : null}
      {mode !== "verify" ? <Field label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === "login" ? "current-password" : "new-password"} /> : null}
      {mode === "verify" ? <Field label="Código de 6 dígitos" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} /> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button title={mode === "login" ? "Entrar" : mode === "register" ? "Crear cuenta" : "Verificar"} onPress={() => void submit()} busy={busy} />
    </Card>
    <View style={{ gap: 10 }}>
      {mode !== "login" ? <Text accessibilityRole="link" onPress={() => { setMode("login"); setError(""); }} style={ui.link}>Ya tengo cuenta · Iniciar sesión</Text> : null}
      {mode !== "register" && mode !== "verify" ? <Text accessibilityRole="link" onPress={() => { setMode("register"); setError(""); }} style={ui.link}>Crear cuenta Cliente</Text> : null}
      {mode === "register" ? <Text style={ui.body}>La contraseña debe tener al menos 12 caracteres.</Text> : null}
    </View>
  </Page></ScrollView>;
}
