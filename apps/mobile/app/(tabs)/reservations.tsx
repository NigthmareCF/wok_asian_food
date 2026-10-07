import { randomUUID } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Platform, ScrollView, Text, View } from "react-native";
import { Button, Card, Field, Heading, Notice, Page, palette, ui } from "@/components/ui";
import { ApiError, ReservationHistoryItem, ReservationResult } from "@/lib/api";
import { normalizeAccountOwner } from "@/lib/account-storage";
import { createReservationState } from "@/lib/reservation-attempt";
import { useSession } from "@/providers/session-provider";

const webValues = new Map<string, string>();
const webStorage = {
  getItemAsync: async (key: string) => webValues.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { webValues.set(key, value); },
  deleteItemAsync: async (key: string) => { webValues.delete(key); },
};

export default function ReservationsScreen() {
  const context = useSession();
  const owner = normalizeAccountOwner(context.session?.email);
  const version = context.session?.version;
  return <ReservationRequest key={`${owner ?? "guest"}:${version ?? 0}`} {...context} />;
}

type ReservationRequestProps = Pick<ReturnType<typeof useSession>, "session" | "request" | "ready">;
function ReservationRequest({ session, request, ready: sessionReady }: ReservationRequestProps) {
  const mounted = useRef(true);
  const current = useCallback(() => mounted.current, []);
  const [attemptState] = useState(() => createReservationState(Platform.OS === "web" ? webStorage : SecureStore, session?.email));
  const saved = useSyncExternalStore(attemptState.subscribe, attemptState.getSnapshot, attemptState.getServerSnapshot);
  const [guests, setGuests] = useState("2");
  const [requestedAt, setRequestedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [preorder, setPreorder] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"info" | "success">("info");
  const [error, setError] = useState("");
  const [history, setHistory] = useState<ReservationHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [cancellingReservationId, setCancellingReservationId] = useState<string | null>(null);
  const [cancellationError, setCancellationError] = useState("");
  const [cancellationNotice, setCancellationNotice] = useState("");
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftError, setDraftError] = useState("");
  const sending = useRef(false);

  const restoreSaved = useCallback(() => attemptState.restore().then(() => {
    if (!current()) return;
    const restored = attemptState.getSnapshot();
    if (restored.pending) {
      const body = JSON.parse(restored.pending.body);
      setGuests(String(body.guests)); setRequestedAt(body.requestedAt); setNotes(body.notes ?? ""); setPreorder(body.preorder);
    } else if (restored.draft) {
      setGuests(restored.draft.guests); setRequestedAt(restored.draft.requestedAt);
      setNotes(restored.draft.notes); setPreorder(restored.draft.preorder); setDraftRestored(true);
    }
  }), [attemptState, current]);

  useLayoutEffect(() => {
    mounted.current = true;
    attemptState.bindLifecycle(current);
    return () => { mounted.current = false; };
  }, [attemptState, current]);

  useEffect(() => { void restoreSaved(); }, [restoreSaved]);

  useEffect(() => {
    if (!session?.email || !saved.ready || saved.pending || busy) return;
    const timer = setTimeout(() => {
      void attemptState.saveDraft({ ownerEmail: session.email, guests, requestedAt, notes, preorder, savedAt: Date.now() })
        .then(() => { if (current()) setDraftError(""); })
        .catch(() => { if (current()) setDraftError("No se pudo guardar el borrador en este dispositivo."); });
    }, 350);
    return () => clearTimeout(timer);
  }, [session?.email, saved.ready, saved.pending, busy, guests, requestedAt, notes, preorder, attemptState, current]);

  const refreshHistory = useCallback(async () => {
    if (!current()) return;
    if (!session) { setHistory([]); return; }
    setHistoryLoading(true); setHistoryError("");
    try { const result = await request<ReservationHistoryItem[]>("/api/v1/client/reservations"); if (current()) setHistory(result); }
    catch (e) { if (current()) setHistoryError(e instanceof Error ? e.message : "No se pudo cargar tu historial."); }
    finally { if (current()) setHistoryLoading(false); }
  }, [request, session, current]);

  useEffect(() => { void Promise.resolve().then(refreshHistory); }, [refreshHistory]);

  async function submit() {
    if (!current() || sending.current) return;
    setError(""); setMessage("");
    if (!session || !sessionReady) { setError("Inicia sesión desde Mi cuenta para enviar una solicitud."); return; }
    const snapshot = attemptState.getSnapshot();
    if (!snapshot.ready) { setError("Espera mientras recuperamos la solicitud guardada."); return; }
    let body = snapshot.pending?.body;
    if (!body) {
      const date = new Date(requestedAt);
      const count = Number(guests);
      if (!Number.isInteger(count) || count < 1 || count > 50) { setError("Indica entre 1 y 50 personas."); return; }
      if (!requestedAt || Number.isNaN(date.getTime())) { setError("Indica una fecha y hora válidas."); return; }
      if (date.getTime() < Date.now() + 3 * 60 * 60 * 1000) { setError("Las solicitudes requieren al menos 3 horas de anticipación."); return; }
      body = JSON.stringify({ guests: count, requestedAt: date.toISOString(), preorder, notes: notes.trim() || null });
    }
    sending.current = true; setBusy(true);
    try {
      const pending = await attemptState.prepare(body, snapshot.pending?.key ?? randomUUID());
      if (!current()) return;
      const response = await request<unknown>("/api/v1/client/reservations", {
        method: "POST", headers: { "Idempotency-Key": pending.key }, body: pending.body,
      });
      if (!current()) return;
      const result = await attemptState.acknowledge(pending.key, response);
      if (!current()) return;
      setDraftRestored(false); setDraftError("");
      setGuests("2"); setRequestedAt(""); setNotes(""); setPreorder(false);
      setMessageTone(result.submitted ? "success" : "info");
      setMessage(result.message || (result.submitted
        ? "Solicitud enviada; el equipo debe revisarla y confirmarla."
        : `La solicitud no fue aceptada automáticamente (${result.decision}).`));
      void refreshHistory();
    } catch (e) {
      // HTTP status alone does not prove non-execution or release a previous uncertain attempt.
      if (current()) setError(e instanceof ApiError ? e.message : "No pudimos confirmar el resultado. Reintenta la misma solicitud.");
    } finally { sending.current = false; if (current()) setBusy(false); }
  }

  async function cancelRequest(reservationId: string) {
    if (!current()) return;
    setCancellingReservationId(reservationId); setCancellationError(""); setCancellationNotice("");
    try {
      await request<{ reservationId: string; status: string }>(`/api/v1/client/reservations/${reservationId}`, { method: "DELETE" });
      if (!current()) return;
      setCancellationNotice("Cancelamos tu solicitud pendiente.");
      await refreshHistory();
    } catch (cause) { if (current()) setCancellationError(cause instanceof Error ? cause.message : "No pudimos cancelar la solicitud."); }
    finally { if (current()) setCancellingReservationId(null); }
  }

  return <ScrollView contentContainerStyle={{ flexGrow: 1 }}><Page><Heading eyebrow="Planifica tu visita">Solicitar reserva</Heading>
    <Text style={ui.body}>El restaurante revisará capacidad y horario. Enviar una solicitud no confirma la reserva.</Text>
    {session?.offline ? <Notice>Sin conexión al restaurante. Puedes revisar tu borrador; enviar requiere conexión y confirmación del servidor.</Notice> : null}
    {draftRestored ? <Notice tone="success">Restauramos tu borrador guardado en este dispositivo.</Notice> : null}
    {session && Platform.OS !== "web" ? <Notice>El borrador se guarda en este dispositivo. Nunca se envía automáticamente al recuperar conexión.</Notice> : null}
    {draftError ? <Notice tone="error">{draftError}</Notice> : null}
    {saved.error ? <><Notice tone="error">{saved.error}</Notice><Button title="Reintentar recuperación" secondary onPress={() => void restoreSaved()} /></> : null}
    {saved.pending ? <Notice>Conservamos una solicitud sin resultado confirmado. Reintenta la misma solicitud; no se enviará automáticamente.</Notice> : null}
    <Card>
      <Field label="Personas" keyboardType="number-pad" editable={saved.ready && !saved.pending && !busy} value={guests} onChangeText={setGuests} placeholder="2" />
      <Field label="Fecha y hora" editable={saved.ready && !saved.pending && !busy} value={requestedAt} onChangeText={setRequestedAt} placeholder="2026-10-05T18:30" autoCapitalize="none" />
      <Text style={{ color: "#746e67", fontSize: 13 }}>Formato local: AAAA-MM-DDTHH:mm. Solicita con al menos 3 horas de anticipación.</Text>
      <Field label="Solicitudes especiales (opcional)" editable={saved.ready && !saved.pending && !busy} value={notes} onChangeText={setNotes} placeholder="Cuéntanos cómo podemos ayudarte" multiline numberOfLines={3} maxLength={500} textAlignVertical="top" />
      <Button title={preorder ? "Preorden requerida: sí (tocar para cambiar)" : "¿Requieres preorden? No"} secondary disabled={!saved.ready || Boolean(saved.pending) || busy} onPress={() => setPreorder(!preorder)} />
      {preorder ? <Text style={{ color: "#746e67", fontSize: 13 }}>Esto avisa al equipo para evaluar la solicitud; aún no agrega productos.</Text> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone={messageTone}>{message}</Notice> : null}
      <Button title={saved.pending ? "Reintentar la misma solicitud" : "Enviar solicitud"} busy={busy} disabled={!session || !sessionReady || !saved.ready} onPress={submit} />
    </Card>
    {session ? <Card>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Text style={{ color: palette.ink, fontSize: 20, fontWeight: "800", flex: 1 }}>Mis solicitudes</Text>
        {historyLoading ? <ActivityIndicator accessibilityLabel="Cargando solicitudes" color={palette.red} /> : null}
      </View>
      {historyError ? <Notice tone="error">{historyError}</Notice> : null}
      {cancellationError ? <Notice tone="error">{cancellationError}</Notice> : null}
      {cancellationNotice ? <Notice tone="success">{cancellationNotice}</Notice> : null}
      {!historyLoading && !historyError && history.length === 0 ? <Notice>Aún no tienes solicitudes de reserva.</Notice> : null}
      {history.map((item) => <View key={item.requestId} style={{ borderWidth: 1, borderColor: palette.line, borderRadius: 12, padding: 14, gap: 6 }}>
        <Text style={{ color: palette.ink, fontWeight: "800" }}>{item.requestedAt ? formatDate(item.requestedAt) : "Horario no disponible"}</Text>
        <Text style={ui.body}>{item.guests ? `${item.guests} ${item.guests === 1 ? "persona" : "personas"}` : "Tamaño de grupo no disponible"}</Text>
        <Text style={ui.pill}>{decisionLabel(item.decision, item.reservationStatus)}</Text>
        <Text style={ui.body}>{item.message}</Text>
        {item.reservationStatus === "REQUESTED" && item.reservationId ? <>
          <Notice>Esta solicitud aún espera revisión. Sólo se pueden cancelar solicitudes pendientes; las reservas confirmadas requieren contactar al restaurante.</Notice>
          <Button title="Cancelar solicitud pendiente" secondary busy={cancellingReservationId === item.reservationId}
            disabled={Boolean(cancellingReservationId)} onPress={() => item.reservationId ? void cancelRequest(item.reservationId) : undefined} />
        </> : null}
      </View>)}
      <Button title="Actualizar solicitudes" secondary busy={historyLoading} onPress={() => void refreshHistory()} />
    </Card> : null}
    {!session ? <Notice>Necesitas una cuenta Cliente verificada. Puedes crearla desde Mi cuenta.</Notice> : null}
  </Page></ScrollView>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Horario no disponible" : date.toLocaleString("es-GT", { dateStyle: "medium", timeStyle: "short" });
}

function decisionLabel(decision: ReservationResult["decision"], status?: string | null) {
  if (status === "CONFIRMED") return "Reserva confirmada";
  if (status === "ARRIVED") return "Llegada registrada";
  if (status === "SEATED") return "En mesa";
  if (status === "CANCELLED") return "Reserva cancelada";
  if (status === "COMPLETED") return "Visita completada";
  if (status === "NO_SHOW") return "Visita no realizada";
  if (status === "REQUESTED") return "Pendiente de revisión";
  if (decision === "SUGGEST_OTHER_TIME") return "Prueba otro horario";
  if (decision === "REJECT") return "No disponible";
  if (decision === "ACCEPT" || decision === "ACCEPT_WITH_CONDITIONS") return "Pendiente de confirmación";
  return "En revisión por el equipo";
}
