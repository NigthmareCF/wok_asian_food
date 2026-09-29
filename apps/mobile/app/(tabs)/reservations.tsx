import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Button, Card, Field, Heading, Notice, Page, palette, ui } from "@/components/ui";
import { ReservationHistoryItem, ReservationResult } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

export default function ReservationsScreen() {
  const { session, request } = useSession();
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
  const pendingRequest = useRef<{ body: string; key: string } | null>(null);

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
    const date = new Date(requestedAt);
    const count = Number(guests);
    if (!Number.isInteger(count) || count < 1 || count > 50) { setError("Indica entre 1 y 50 personas."); return; }
    if (!requestedAt || Number.isNaN(date.getTime())) { setError("Indica una fecha y hora válidas."); return; }
    if (date.getTime() < Date.now() + 3 * 60 * 60 * 1000) { setError("Las solicitudes requieren al menos 3 horas de anticipación."); return; }
    const body = JSON.stringify({ guests: count, requestedAt: date.toISOString(), preorder, notes: notes.trim() || null });
    if (!pendingRequest.current || pendingRequest.current.body !== body) pendingRequest.current = { body, key: createRequestKey() };
    setBusy(true);
    try {
      const result = await request<ReservationResult>("/api/v1/client/reservations", {
        method: "POST", headers: { "Idempotency-Key": pendingRequest.current.key }, body,
      });
      pendingRequest.current = null;
      setMessageTone(result.submitted ? "success" : "info");
      setMessage(result.message || (result.submitted
        ? "Solicitud enviada; el equipo debe revisarla y confirmarla."
        : `La solicitud no fue aceptada automáticamente (${result.decision}).`));
      void refreshHistory();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo enviar la solicitud."); }
    finally { setBusy(false); }
  }

  return <ScrollView contentContainerStyle={{ flexGrow: 1 }}><Page><Heading eyebrow="Planifica tu visita">Solicitar reserva</Heading>
    <Text style={ui.body}>El restaurante revisará capacidad y horario. Enviar una solicitud no confirma la reserva.</Text>
    <Card>
      <Field label="Personas" keyboardType="number-pad" value={guests} onChangeText={setGuests} placeholder="2" />
      <Field label="Fecha y hora" value={requestedAt} onChangeText={setRequestedAt} placeholder="2026-10-05T18:30" autoCapitalize="none" />
      <Text style={{ color: "#746e67", fontSize: 13 }}>Formato local: AAAA-MM-DDTHH:mm. Solicita con al menos 3 horas de anticipación.</Text>
      <Field label="Solicitudes especiales (opcional)" value={notes} onChangeText={setNotes} placeholder="Cuéntanos cómo podemos ayudarte" multiline numberOfLines={3} textAlignVertical="top" />
      <Button title={preorder ? "Preorden requerida: sí (tocar para cambiar)" : "¿Requieres preorden? No"} secondary onPress={() => setPreorder(!preorder)} />
      {preorder ? <Text style={{ color: "#746e67", fontSize: 13 }}>Esto avisa al equipo para evaluar la solicitud; aún no agrega productos.</Text> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone={messageTone}>{message}</Notice> : null}
      <Button title="Enviar solicitud" busy={busy} onPress={submit} />
    </Card>
    {session ? <Card>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Text style={{ color: palette.ink, fontSize: 20, fontWeight: "800", flex: 1 }}>Mis solicitudes</Text>
        {historyLoading ? <ActivityIndicator accessibilityLabel="Cargando solicitudes" color={palette.red} /> : null}
      </View>
      {historyError ? <Notice tone="error">{historyError}</Notice> : null}
      {!historyLoading && !historyError && history.length === 0 ? <Notice>Aún no tienes solicitudes de reserva.</Notice> : null}
      {history.map((item) => <View key={item.requestId} style={{ borderWidth: 1, borderColor: palette.line, borderRadius: 12, padding: 14, gap: 6 }}>
        <Text style={{ color: palette.ink, fontWeight: "800" }}>{item.requestedAt ? formatDate(item.requestedAt) : "Horario no disponible"}</Text>
        <Text style={ui.body}>{item.guests ? `${item.guests} ${item.guests === 1 ? "persona" : "personas"}` : "Tamaño de grupo no disponible"}</Text>
        <Text style={ui.pill}>{decisionLabel(item.decision, item.reservationStatus)}</Text>
        <Text style={ui.body}>{item.message}</Text>
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

function createRequestKey() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}
