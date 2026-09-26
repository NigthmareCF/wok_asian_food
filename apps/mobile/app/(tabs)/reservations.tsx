import { useRef, useState } from "react";
import { ScrollView, Text } from "react-native";
import { Button, Card, Field, Heading, Notice, Page, ui } from "@/components/ui";
import { ReservationResult } from "@/lib/api";
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
  const pendingRequest = useRef<{ body: string; key: string } | null>(null);

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
    {!session ? <Notice>Necesitas una cuenta Cliente verificada. Puedes crearla desde Mi cuenta.</Notice> : null}
  </Page></ScrollView>;
}

function createRequestKey() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}
