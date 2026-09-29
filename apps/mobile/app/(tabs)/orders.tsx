import { Link } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Button, Card, Heading, Notice, Page, palette, ui } from "@/components/ui";
import { PickupRequestState } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

const statusLabels: Record<PickupRequestState["status"], string> = {
  PENDING_REVIEW: "Pendiente de revisión", ACCEPTED: "Aceptada por el restaurante",
  REJECTED: "No aceptada", CANCELLED: "Cancelada", EXPIRED: "Vencida",
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Horario no disponible" : date.toLocaleString("es-GT", { dateStyle: "medium", timeStyle: "short" });
}

function formatMoney(amount: number, currency: string) {
  try { return new Intl.NumberFormat("es-GT", { style: "currency", currency }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
}

export default function PickupRequestsScreen() {
  const { session, request } = useSession();
  const [requests, setRequests] = useState<PickupRequestState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    if (!session) { setRequests([]); setError(""); return; }
    setLoading(true); setError("");
    try { setRequests(await request<PickupRequestState[]>("/api/v1/client/order-requests")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos cargar tus solicitudes."); }
    finally { setLoading(false); }
  }, [request, session]);

  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);

  async function cancel(requestId: string) {
    setCancelling(requestId); setError(""); setNotice("");
    try {
      await request<{ requestId: string; status: PickupRequestState["status"] }>(`/api/v1/client/order-requests/${requestId}`, { method: "DELETE" });
      setNotice("Cancelamos tu solicitud. No se había confirmado un pedido ni realizado un cobro.");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos cancelar la solicitud."); }
    finally { setCancelling(null); }
  }

  return <ScrollView contentContainerStyle={{ flexGrow: 1 }}><Page>
    <Heading eyebrow="Pickup">Mis solicitudes</Heading>
    <Text style={ui.body}>Consulta el estado de las solicitudes para recoger y cancela las que aún esperan revisión.</Text>
    {!session ? <Card><Notice>Inicia sesión con una cuenta Cliente para consultar tus solicitudes.</Notice><Link href="/account" style={ui.link}>Ir a Mi cuenta</Link></Card> : <>
      {session.offline ? <Notice>Sin conexión. El historial requiere consultar el servidor y no se modifica sin confirmación.</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {loading && requests.length === 0 ? <Card><View style={ui.row}><ActivityIndicator color={palette.red} /><Text style={ui.body}>Cargando tus solicitudes…</Text></View></Card> : null}
      {!loading && !error && requests.length === 0 ? <Card><Notice>Aún no tienes solicitudes pickup.</Notice><Link href="/(tabs)/menu" style={ui.link}>Explorar menú</Link></Card> : null}
      {requests.map((item) => <Card key={item.requestId}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <Text style={{ flex: 1, color: palette.ink, fontWeight: "800", fontSize: 17 }}>{statusLabels[item.status] ?? "Estado actualizado"}</Text>
          <Text style={ui.pill}>{item.requestId.slice(0, 8)}</Text>
        </View>
        <Text style={ui.body}>Hora solicitada: {formatDate(item.requestedFor)}</Text>
        <Text style={[ui.body, { color: palette.ink, fontWeight: "700" }]}>Subtotal informado: {formatMoney(item.subtotal, item.currency)}</Text>
        <Text style={ui.body}>{item.message}</Text>
        {item.status === "PENDING_REVIEW" ? <>
          <Notice>Esta solicitud todavía no es un pedido aceptado y no se ha cobrado.</Notice>
          <Button title="Cancelar solicitud" secondary busy={cancelling === item.requestId} disabled={Boolean(cancelling)} onPress={() => void cancel(item.requestId)} />
        </> : null}
      </Card>)}
      <Button title="Actualizar solicitudes" secondary busy={loading} onPress={() => void refresh()} />
    </>}
  </Page></ScrollView>;
}
