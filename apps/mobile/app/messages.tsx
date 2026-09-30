import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Button, Card, Field, Heading, Notice, Page, palette, ui } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

type Conversation = { conversationId: string; status: "OPEN" | "WAITING" | "CLOSED"; updatedAt: string };
type Message = { messageId: string; senderType: "CUSTOMER" | "HUMAN" | "AI" | "SYSTEM"; body: string; status: string; createdAt: string };
type PendingMessage = { key: string; body: string };

const pendingPrefix = "wok.messaging.pending.";
const statusLabels: Record<Conversation["status"], string> = {
  OPEN: "Conversación abierta", WAITING: "En espera de respuesta", CLOSED: "Conversación cerrada",
};

export default function MessagesScreen() {
  const { session, request } = useSession();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<PendingMessage | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadConversation = useCallback(async () => {
    if (!session) return;
    setLoading(true); setError("");
    try {
      const conversations = await request<Conversation[]>("/api/v1/client/conversations");
      const active = conversations.find((item) => item.status !== "CLOSED");
      if (!active) { setConversation(null); setMessages([]); setPending(null); return; }
      setConversation(active);
      const [items, stored] = await Promise.all([
        request<Message[]>(`/api/v1/client/conversations/${active.conversationId}/messages`),
        SecureStore.getItemAsync(`${pendingPrefix}${active.conversationId}`),
      ]);
      setMessages(items);
      setPending(stored ? JSON.parse(stored) as PendingMessage : null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "No pudimos cargar tus mensajes.");
    } finally { setLoading(false); }
  }, [request, session]);

  useEffect(() => { void Promise.resolve().then(loadConversation); }, [loadConversation]);

  async function startConversation() {
    setLoading(true); setError("");
    try {
      const opened = await request<Conversation>("/api/v1/client/conversations", { method: "POST" });
      setConversation(opened); setMessages([]); setNotice("La conversación quedó lista para escribir al equipo WOK.");
      const stored = await SecureStore.getItemAsync(`${pendingPrefix}${opened.conversationId}`);
      setPending(stored ? JSON.parse(stored) as PendingMessage : null);
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : "No pudimos iniciar la conversación."); }
    finally { setLoading(false); }
  }

  async function send(messageToSend: PendingMessage) {
    if (!session || !conversation) return;
    setSending(true); setError(""); setNotice("");
    try {
      await request(`/api/v1/client/conversations/${conversation.conversationId}/messages`, {
        method: "POST", headers: { "Idempotency-Key": messageToSend.key },
        body: JSON.stringify({ body: messageToSend.body }),
      });
      await SecureStore.deleteItemAsync(`${pendingPrefix}${conversation.conversationId}`);
      setPending(null); setDraft(""); setNotice("Mensaje enviado. El equipo WOK te responderá por este medio.");
      await loadConversation();
    } catch (cause) {
      setPending(messageToSend);
      setError(cause instanceof ApiError ? cause.message : "No se pudo confirmar el envío. Reintenta con el mismo mensaje.");
    } finally { setSending(false); }
  }

  async function submit() {
    if (!conversation || !draft.trim() || pending) return;
    const attempt = { key: createIdempotencyKey(), body: draft.trim() };
    setPending(attempt);
    await SecureStore.setItemAsync(`${pendingPrefix}${conversation.conversationId}`, JSON.stringify(attempt));
    await send(attempt);
  }

  const canWrite = Boolean(session && conversation?.status !== "CLOSED");
  return <ScrollView contentContainerStyle={{ flexGrow: 1 }}><Page>
    <Heading eyebrow="Atención Cliente">Mensajes</Heading>
    <Text style={ui.body}>Escribe al equipo WOK para recibir ayuda con tus servicios.</Text>
    {!session ? <Card><Notice>Inicia sesión con una cuenta Cliente para consultar o enviar mensajes.</Notice></Card> : <>
      {session.offline ? <Notice>Sin conexión. Los mensajes no se envían sin confirmación del servidor.</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {loading && !conversation ? <Card><View style={ui.row}><ActivityIndicator color={palette.red} /><Text style={ui.body}>Cargando conversación…</Text></View></Card> : null}
      {!conversation && !loading && !session.offline ? <Card>
        <Text style={{ color: palette.ink, fontSize: 18, fontWeight: "800" }}>¿Necesitas ayuda?</Text>
        <Text style={ui.body}>Inicia una conversación para comunicarte directamente con el equipo.</Text>
        <Button title="Iniciar conversación" busy={loading} onPress={() => void startConversation()} />
      </Card> : null}
      {conversation ? <>
        <Card>
          <View style={ui.row}>
            <Text style={{ flex: 1, color: palette.ink, fontWeight: "800", fontSize: 17 }}>Equipo WOK</Text>
            <Text style={ui.pill}>{statusLabels[conversation.status]}</Text>
          </View>
          {messages.length === 0 ? <Notice>Aún no hay mensajes. Cuéntanos cómo podemos ayudarte.</Notice> : messages.map((item) => <View key={item.messageId} style={{ alignSelf: item.senderType === "CUSTOMER" ? "flex-end" : "flex-start", maxWidth: "88%", backgroundColor: item.senderType === "CUSTOMER" ? "#f5e7d2" : "#f2f0ed", borderRadius: 14, padding: 12, gap: 5 }}>
            <Text style={{ color: palette.ink, fontSize: 11, fontWeight: "800" }}>{item.senderType === "CUSTOMER" ? "Tú" : item.senderType === "AI" ? "Asistente WOK" : "Equipo WOK"}</Text>
            <Text style={{ color: palette.ink, fontSize: 15, lineHeight: 21 }}>{item.body}</Text>
            <Text style={{ color: palette.muted, fontSize: 11 }}>{formatDate(item.createdAt)}</Text>
          </View>)}
          {pending ? <Notice tone="error">El envío no se confirmó. Conservamos el mensaje para reintentar sin duplicarlo.</Notice> : null}
          {canWrite && !pending ? <Field label="Tu mensaje" value={draft} onChangeText={setDraft} multiline maxLength={4000} textAlignVertical="top" placeholder="Escribe aquí…" style={{ minHeight: 110, paddingTop: 12 }} /> : null}
          {pending && canWrite ? <Button title={session?.offline ? "Reintentar conexión y envío" : "Reintentar envío"} busy={sending} onPress={() => void send(pending)} /> : null}
          {!pending && canWrite ? <Button title="Enviar mensaje" disabled={!draft.trim()} busy={sending} onPress={() => void submit()} /> : null}
          {!canWrite && conversation.status === "CLOSED" ? <Notice>Esta conversación está cerrada. Puedes iniciar otra si necesitas ayuda.</Notice> : null}
          <Button title="Actualizar mensajes" secondary busy={loading} onPress={() => void loadConversation()} />
        </Card>
        {conversation.status === "CLOSED" ? <Button title="Iniciar otra conversación" secondary busy={loading} onPress={() => void startConversation()} /> : null}
      </> : null}
    </>}
  </Page></ScrollView>;
}

function createIdempotencyKey() {
  return Crypto.randomUUID();
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Fecha no disponible" : date.toLocaleString("es-GT", { dateStyle: "short", timeStyle: "short" });
}
