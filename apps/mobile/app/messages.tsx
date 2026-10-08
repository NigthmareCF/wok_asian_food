import * as SecureStore from "expo-secure-store";
import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import {
  Button,
  Card,
  Field,
  Heading,
  Notice,
  Page,
  useUiTheme,
} from "@/components/ui";
import {
  createMessagingState,
  createMessagingStorage,
  initialMessagingSnapshot,
  type Conversation,
  type MessagingState,
} from "@/lib/messaging-state";
import { useSession } from "@/providers/session-provider";

const statusLabels: Record<Conversation["status"], string> = {
  OPEN: "Conversación abierta",
  WAITING: "En espera de respuesta",
  CLOSED: "Conversación cerrada",
};

export default function MessagesScreen() {
  const { session, request } = useSession();
  return (
    <ConversationScreen
      key={`${session?.email ?? "guest"}:${session?.version ?? 0}`}
      session={session}
      request={request}
    />
  );
}

type ConversationScreenProps = Pick<
  ReturnType<typeof useSession>,
  "session" | "request"
>;

function ConversationScreen({ session, request }: ConversationScreenProps) {
  const { colors, ui } = useUiTheme();
  const [state, setState] = useState(initialMessagingSnapshot);
  const [draft, setDraft] = useState("");
  const [storage] = useState(() =>
    createMessagingStorage(Platform.OS, SecureStore),
  );
  const requestRef = useRef(request);
  const workflowRef = useRef<MessagingState | null>(null);
  const owner = session?.email;
  const version = session?.version;
  const offline = session?.offline ?? true;

  useEffect(() => {
    requestRef.current = request;
  }, [request]);
  useEffect(() => {
    if (!owner) return;
    const workflow = createMessagingState({
      owner,
      storage,
      uuid: randomUUID,
      online: false,
      request: (path, options) => requestRef.current(path, options),
    });
    workflowRef.current = workflow;
    const unsubscribe = workflow.subscribe(setState);
    void workflow.load();
    return () => {
      unsubscribe();
      workflow.dispose();
      workflowRef.current = null;
    };
  }, [owner, version, storage]);
  useEffect(() => {
    workflowRef.current?.setOnline(!offline);
  }, [offline, owner, version]);
  useEffect(
    () => () => {
      if (owner) storage.clearOwner?.(owner);
    },
    [owner, storage],
  );

  async function submit() {
    const workflow = workflowRef.current;
    if (
      workflow &&
      (await workflow.submit(draft)) &&
      workflowRef.current === workflow
    )
      setDraft("");
  }
  async function retry() {
    const workflow = workflowRef.current;
    if (
      workflow &&
      (await workflow.retry()) &&
      workflowRef.current === workflow
    )
      setDraft("");
  }

  const {
    conversation,
    messages,
    pending,
    loading,
    sending,
    error,
    warning,
    notice,
    historyReady,
    storageReady,
  } = state;
  const canWrite = Boolean(
    session &&
    !offline &&
    historyReady &&
    storageReady &&
    !loading &&
    !sending &&
    conversation &&
    conversation.status !== "CLOSED",
  );

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <Page>
        <Heading eyebrow="Atención Cliente">Mensajes</Heading>
        <Text style={ui.body}>
          Escribe al equipo WOK para recibir ayuda con tus servicios.
        </Text>
        {!session ? (
          <Card>
            <Notice>
              Inicia sesión con una cuenta Cliente para consultar o enviar
              mensajes.
            </Notice>
          </Card>
        ) : (
          <>
            {offline ? (
              <Notice>
                Sin conexión. Los mensajes no se envían sin confirmación del
                servidor.
              </Notice>
            ) : null}
            {Platform.OS === "web" ? (
              <Notice>
                En Web, el mensaje pendiente solo vive en esta pantalla. Al
                salir o recargar se pierde el guardado local; el historial
                confirmado sigue en el servidor.
              </Notice>
            ) : null}
            {error ? <Notice tone="error">{error}</Notice> : null}
            {warning ? <Notice>{warning}</Notice> : null}
            {notice ? <Notice tone="success">{notice}</Notice> : null}
            {loading ? (
              <Card>
                <View style={ui.row}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={ui.body}>Cargando conversación…</Text>
                </View>
              </Card>
            ) : null}
            {historyReady &&
            !conversation &&
            !loading &&
            !offline &&
            !pending ? (
              <Card>
                <Text
                  style={{
                    color: colors.foreground,
                    fontSize: 18,
                    fontWeight: "800",
                  }}
                >
                  ¿Necesitas ayuda?
                </Text>
                <Text style={ui.body}>
                  Inicia una conversación para comunicarte directamente con el
                  equipo.
                </Text>
                <Button
                  title="Iniciar conversación"
                  busy={loading}
                  disabled={sending}
                  onPress={() => void workflowRef.current?.start()}
                />
              </Card>
            ) : null}
            {conversation ? (
              <Card>
                <View style={ui.row}>
                  <Text
                    style={{
                      flex: 1,
                      color: colors.foreground,
                      fontWeight: "800",
                      fontSize: 17,
                    }}
                  >
                    Equipo WOK
                  </Text>
                  <Text style={ui.pill}>
                    {statusLabels[conversation.status]}
                  </Text>
                </View>
                {historyReady && !loading && messages.length === 0 ? (
                  <Notice>
                    Aún no hay mensajes. Cuéntanos cómo podemos ayudarte.
                  </Notice>
                ) : null}
                {messages.map((item) => (
                  <View
                    key={item.messageId}
                    style={{
                      alignSelf:
                        item.senderType === "CUSTOMER"
                          ? "flex-end"
                          : "flex-start",
                      maxWidth: "88%",
                      backgroundColor:
                        item.senderType === "CUSTOMER"
                          ? colors.surfaceElevated
                          : colors.surface,
                      borderRadius: 14,
                      padding: 12,
                      gap: 5,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.foreground,
                        fontSize: 11,
                        fontWeight: "800",
                      }}
                    >
                      {item.senderType === "CUSTOMER" ? "Tú" : "Equipo WOK"}
                    </Text>
                    <Text
                      style={{
                        color: colors.foreground,
                        fontSize: 15,
                        lineHeight: 21,
                      }}
                    >
                      {item.body}
                    </Text>
                    <Text
                      style={{ color: colors.mutedForeground, fontSize: 11 }}
                    >
                      {formatDate(item.createdAt)}
                    </Text>
                  </View>
                ))}
                {pending ? (
                  <Notice tone={pending.confirmed ? "info" : "error"}>
                    {pending.confirmed
                      ? "El mensaje está confirmado; solo falta actualizar el guardado local."
                      : "Hay un mensaje pendiente. Reintenta con su misma clave; no se envía automáticamente."}
                  </Notice>
                ) : null}
                {historyReady &&
                !pending &&
                conversation.status !== "CLOSED" ? (
                  <Field
                    label="Tu mensaje"
                    value={draft}
                    onChangeText={setDraft}
                    editable={canWrite}
                    multiline
                    maxLength={4000}
                    textAlignVertical="top"
                    placeholder="Escribe aquí…"
                    className="min-h-28"
                  />
                ) : null}
                {pending ? (
                  <Button
                    title={
                      pending.confirmed
                        ? "Reintentar limpieza local"
                        : "Reintentar el mismo mensaje"
                    }
                    disabled={
                      !historyReady ||
                      loading ||
                      offline ||
                      (conversation.status === "CLOSED" && !pending.confirmed)
                    }
                    busy={sending}
                    onPress={() => void retry()}
                  />
                ) : null}
                {!pending && conversation.status !== "CLOSED" ? (
                  <Button
                    title="Enviar mensaje"
                    disabled={!canWrite || !draft.trim()}
                    busy={sending}
                    onPress={() => void submit()}
                  />
                ) : null}
                {conversation.status === "CLOSED" ? (
                  <Notice>
                    Esta conversación está cerrada. Actualiza para consultar las
                    conversaciones abiertas.
                  </Notice>
                ) : null}
              </Card>
            ) : null}
            <Button
              title="Actualizar mensajes"
              secondary
              busy={loading}
              disabled={sending}
              onPress={() => void workflowRef.current?.load()}
            />
          </>
        )}
      </Page>
    </ScrollView>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Fecha no disponible"
    : date.toLocaleString("es-GT", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Guatemala",
      });
}
