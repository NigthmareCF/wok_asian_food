import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, Text, View } from "react-native";
import { Button, Card, Field, Heading, Notice, Page, palette, ui } from "@/components/ui";
import { ReservationHistoryItem, ReservationResult } from "@/lib/api";
import { parsePendingReservationAttempt, PendingReservationAttempt, resolvePendingReservationAttempt } from "@/lib/reservation-attempt";
import { formatRestaurantDateTime, parseRestaurantLocalDateTime, restaurantTimeZone } from "@/lib/restaurant-time";
import { useSession } from "@/providers/session-provider";

export default function ReservationsScreen() {
  const { session, request } = useSession();
  return <ReservationForm key={session?.email ?? "guest"} session={session} request={request} />;
}

function ReservationForm({ session, request }: Pick<ReturnType<typeof useSession>, "session" | "request">) {
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
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [attemptRestored, setAttemptRestored] = useState(false);
  const [draftError, setDraftError] = useState("");
  const pendingRequest = useRef<PendingReservationAttempt | null>(null);

  useEffect(() => {
    let active = true;
    if (!session?.email) return () => { active = false; };
    void Promise.resolve().then(async () => {
      if (Platform.OS !== "web") {
        const attemptStorageKey = await getReservationAttemptStorageKey(session.email);
        const raw = await SecureStore.getItemAsync(reservationDraftKey);
        if (raw) {
          const draft = parseReservationDraft(raw);
          if (draft && draft.ownerEmail === session.email && Date.now() - draft.savedAt < reservationDraftLifetimeMs) {
            if (active) {
              setGuests(draft.guests);
              setRequestedAt(draft.requestedAt);
              setNotes(draft.notes);
              setPreorder(draft.preorder);
              setDraftRestored(true);
            }
          } else if (draft && Date.now() - draft.savedAt >= reservationDraftLifetimeMs) {
            await SecureStore.deleteItemAsync(reservationDraftKey);
          } else if (!draft) {
            await SecureStore.deleteItemAsync(reservationDraftKey);
          }
        }
        const rawAttempt = await SecureStore.getItemAsync(attemptStorageKey);
        if (rawAttempt) {
          const attempt = parsePendingReservationAttempt(rawAttempt);
          if (attempt && attempt.ownerEmail === session.email) {
            if (active) {
              pendingRequest.current = attempt;
              setAttemptRestored(true);
            }
          } else {
            await SecureStore.deleteItemAsync(attemptStorageKey);
          }
        }
      }
    }).catch(() => { if (active) setDraftError("No se pudo leer el borrador guardado en este dispositivo."); })
      .finally(() => { if (active) setDraftReady(true); });
    return () => { active = false; };
  }, [session?.email]);

  useEffect(() => {
    if (!session?.email || !draftReady || Platform.OS === "web" || !hasReservationDraft(guests, requestedAt, notes, preorder)) return;
    const draft: ReservationDraft = {
      ownerEmail: session.email, guests, requestedAt, notes, preorder, savedAt: Date.now(),
    };
    const timer = setTimeout(() => {
      void SecureStore.setItemAsync(reservationDraftKey, JSON.stringify(draft))
        .then(() => setDraftError(""))
        .catch(() => setDraftError("No se pudo guardar el borrador en este dispositivo."));
    }, 350);
    return () => clearTimeout(timer);
  }, [session?.email, draftReady, guests, requestedAt, notes, preorder]);

  const refreshHistory = useCallback(async () => {
    if (!session) { setHistory([]); return; }
    setHistoryLoading(true); setHistoryError("");
    try { setHistory(await request<ReservationHistoryItem[]>("/api/v1/client/reservations")); }
    catch (e) { setHistoryError(e instanceof Error ? e.message : "No se pudo cargar tu historial."); }
    finally { setHistoryLoading(false); }
  }, [request, session]);

  useEffect(() => { void Promise.resolve().then(refreshHistory); }, [refreshHistory]);

  async function submit() {
    setError(""); setMessage("");
    if (!session) { setError("Inicia sesión desde Mi cuenta para enviar una solicitud."); return; }
    const date = parseRestaurantLocalDateTime(requestedAt);
    const count = Number(guests);
    if (!Number.isInteger(count) || count < 1 || count > 50) { setError("Indica entre 1 y 50 personas."); return; }
    if (!date) { setError("Indica una fecha y hora válidas en la hora de Guatemala."); return; }
    if (date.getTime() < Date.now() + 3 * 60 * 60 * 1000) { setError("Las solicitudes requieren al menos 3 horas de anticipación."); return; }
    const body = JSON.stringify({ guests: count, requestedAt: date.toISOString(), preorder, notes: notes.trim() || null });
    const attempt = resolvePendingReservationAttempt(pendingRequest.current, session.email, body, createRequestKey);
    pendingRequest.current = attempt;
    if (Platform.OS !== "web") {
      try {
        const attemptStorageKey = await getReservationAttemptStorageKey(session.email);
        await SecureStore.setItemAsync(attemptStorageKey, JSON.stringify(attempt));
      }
      catch {
        setError("No pudimos guardar el intento de forma segura; no enviamos la solicitud para evitar duplicados.");
        return;
      }
    }
    setBusy(true);
    try {
      const result = await request<ReservationResult>("/api/v1/client/reservations", {
        method: "POST", headers: { "Idempotency-Key": attempt.key }, body,
      });
      pendingRequest.current = null;
      if (Platform.OS !== "web") {
        try {
          const attemptStorageKey = await getReservationAttemptStorageKey(session.email);
          await SecureStore.deleteItemAsync(reservationDraftKey);
          await SecureStore.deleteItemAsync(attemptStorageKey);
        } catch { setDraftError("La solicitud respondió, pero no pudimos borrar todo el estado local."); }
      }
      setDraftRestored(false);
      setAttemptRestored(false);
      setGuests("2"); setRequestedAt(""); setNotes(""); setPreorder(false);
      setMessageTone(result.submitted ? "success" : "info");
      setMessage(result.message || (result.submitted
        ? "Solicitud enviada; el equipo debe revisarla y confirmarla."
        : `La solicitud no fue aceptada automáticamente (${result.decision}).`));
      void refreshHistory();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo enviar la solicitud."); }
    finally { setBusy(false); }
  }

  async function cancelRequest(reservationId: string) {
    setCancellingReservationId(reservationId); setCancellationError(""); setCancellationNotice("");
    try {
      await request<{ reservationId: string; status: string }>(`/api/v1/client/reservations/${reservationId}`, { method: "DELETE" });
      setCancellationNotice("Cancelamos tu solicitud pendiente.");
      await refreshHistory();
    } catch (cause) { setCancellationError(cause instanceof Error ? cause.message : "No pudimos cancelar la solicitud."); }
    finally { setCancellingReservationId(null); }
  }

  return <ScrollView contentContainerStyle={{ flexGrow: 1 }}><Page><Heading eyebrow="Planifica tu visita">Solicitar reserva</Heading>
    <Text style={ui.body}>El restaurante revisará capacidad y horario. Enviar una solicitud no confirma la reserva.</Text>
    {session?.offline ? <Notice>Sin conexión al restaurante. Puedes revisar tu borrador; enviar requiere conexión y confirmación del servidor.</Notice> : null}
    {draftRestored ? <Notice tone="success">Restauramos tu borrador guardado en este dispositivo.</Notice> : null}
    {attemptRestored ? <Notice tone="error">Hay un envío anterior cuyo resultado no se pudo confirmar. Al reenviar la misma información usaremos la misma clave para evitar duplicar la solicitud.</Notice> : null}
    {session && Platform.OS !== "web" ? <Notice>El borrador se guarda en este dispositivo. Nunca se envía automáticamente al recuperar conexión.</Notice> : null}
    {draftError ? <Notice tone="error">{draftError}</Notice> : null}
    <Card>
      <Field label="Personas" keyboardType="number-pad" value={guests} onChangeText={setGuests} placeholder="2" />
      <Field label="Fecha y hora de Guatemala" value={requestedAt} onChangeText={setRequestedAt} placeholder="2026-10-05T18:30" autoCapitalize="none" />
      <Text style={{ color: "#746e67", fontSize: 13 }}>Hora del restaurante ({restaurantTimeZone}), AAAA-MM-DDTHH:mm. Solicita con al menos 3 horas de anticipación.</Text>
      <Field label="Solicitudes especiales (opcional)" value={notes} onChangeText={setNotes} placeholder="Cuéntanos cómo podemos ayudarte" multiline numberOfLines={3} maxLength={500} textAlignVertical="top" />
      <Button title={preorder ? "Preorden requerida: sí (tocar para cambiar)" : "¿Requieres preorden? No"} secondary onPress={() => setPreorder(!preorder)} />
      {preorder ? <Text style={{ color: "#746e67", fontSize: 13 }}>Esto avisa al equipo para evaluar la solicitud; aún no agrega productos.</Text> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone={messageTone}>{message}</Notice> : null}
      <Button title="Enviar solicitud" busy={busy} disabled={Boolean(session && Platform.OS !== "web" && !draftReady)} onPress={submit} />
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

type ReservationDraft = {
  ownerEmail: string;
  guests: string;
  requestedAt: string;
  notes: string;
  preorder: boolean;
  savedAt: number;
};

const reservationDraftKey = "wok.client.reservation-draft.v1";
const reservationDraftLifetimeMs = 30 * 24 * 60 * 60 * 1000;

async function getReservationAttemptStorageKey(ownerEmail: string) {
  const ownerHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, ownerEmail);
  return `wok.client.reservation-attempt.v1.${ownerHash}`;
}

function parseReservationDraft(raw: string): ReservationDraft | null {
  if (raw.length > 1800) return null;
  try {
    const value = JSON.parse(raw) as Partial<ReservationDraft>;
    if (typeof value.ownerEmail !== "string" || typeof value.guests !== "string" ||
        typeof value.requestedAt !== "string" || typeof value.notes !== "string" ||
        typeof value.preorder !== "boolean" || typeof value.savedAt !== "number") return null;
    return value as ReservationDraft;
  } catch { return null; }
}

function hasReservationDraft(guests: string, requestedAt: string, notes: string, preorder: boolean) {
  return guests !== "2" || requestedAt.length > 0 || notes.length > 0 || preorder;
}

function formatDate(value: string) {
  return formatRestaurantDateTime(value);
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

function createRequestKey() {
  return Crypto.randomUUID();
}
