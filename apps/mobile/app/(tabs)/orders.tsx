import { Link } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Button, Card, Heading, Notice, Page, palette, ui } from "@/components/ui";
import { PickupOrderTracking, PickupRequestDetails, PickupRequestState } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

const statusLabels: Record<PickupRequestState["status"], string> = {
  PENDING_REVIEW: "Pendiente de revisión", ACCEPTED: "Aceptada por el restaurante",
  REJECTED: "No aceptada", CANCELLED: "Cancelada", EXPIRED: "Vencida",
};
const orderStatusLabels: Record<PickupOrderTracking["status"], string> = {
  SENT: "Recibido por cocina", PREPARING: "En preparación", READY: "Listo para recoger",
  SERVED: "Entregado", CLOSED: "Cerrado", CANCELLED: "Cancelado",
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Horario no disponible" : date.toLocaleString("es-GT", { dateStyle: "medium", timeStyle: "short" });
}

function formatMoney(amount: number, currency: string) {
  try { return new Intl.NumberFormat("es-GT", { style: "currency", currency }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
}

function pickupPaymentLabel(value: PickupRequestState["paymentPreference"]) {
  if (value === "CARD_AT_PICKUP") return "Tarjeta al recoger";
  if (value === "TRANSFER_AT_PICKUP") return "Transferencia al recoger";
  return value === "CASH_AT_PICKUP" ? "Efectivo al recoger" : "Sin preferencia registrada";
}

export default function PickupRequestsScreen() {
  const { session, request } = useSession();
  const [requests, setRequests] = useState<PickupRequestState[]>([]);
  const [trackedOrders, setTrackedOrders] = useState<PickupOrderTracking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [details, setDetails] = useState<Record<string, PickupRequestDetails>>({});
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState("");

  const refresh = useCallback(async () => {
    if (!session) { setRequests([]); setError(""); return; }
    setLoading(true); setError("");
    try { setRequests(await request<PickupRequestState[]>("/api/v1/client/order-requests")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos cargar tus solicitudes."); }
    finally { setLoading(false); }
  }, [request, session]);

  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);

  const refreshTracking = useCallback(async () => {
    if (!session || session.offline) { setTrackedOrders([]); setTrackingError(""); return; }
    setTrackingLoading(true); setTrackingError("");
    try { setTrackedOrders(await request<PickupOrderTracking[]>("/api/v1/client/orders/tracking")); }
    catch (cause) { setTrackingError(cause instanceof Error ? cause.message : "No pudimos actualizar el seguimiento."); }
    finally { setTrackingLoading(false); }
  }, [request, session]);

  useEffect(() => { void Promise.resolve().then(refreshTracking); }, [refreshTracking]);
  useEffect(() => {
    if (!session || session.offline || !trackedOrders.some((order) => order.status === "SENT" || order.status === "PREPARING")) return;
    const timer = setInterval(() => { void refreshTracking(); }, 30_000);
    return () => clearInterval(timer);
  }, [refreshTracking, session, trackedOrders]);

  async function cancel(requestId: string) {
    setCancelling(requestId); setError(""); setNotice("");
    try {
      await request<{ requestId: string; status: PickupRequestState["status"] }>(`/api/v1/client/order-requests/${requestId}`, { method: "DELETE" });
      setNotice("Cancelamos tu solicitud. No se había confirmado un pedido ni realizado un cobro.");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos cancelar la solicitud."); }
    finally { setCancelling(null); }
  }

  async function toggleDetails(requestId: string) {
    if (details[requestId]) {
      setDetails((current) => { const next = { ...current }; delete next[requestId]; return next; });
      return;
    }
    setLoadingDetails(requestId); setError("");
    try {
      const result = await request<PickupRequestDetails>(`/api/v1/client/order-requests/${requestId}`);
      setDetails((current) => ({ ...current, [requestId]: result }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos cargar el detalle."); }
    finally { setLoadingDetails(null); }
  }

  return <ScrollView contentContainerStyle={{ flexGrow: 1 }}><Page>
    <Heading eyebrow="Pickup">Mis solicitudes</Heading>
    <Text style={ui.body}>Consulta el estado de las solicitudes para recoger y cancela las que aún esperan revisión.</Text>
    {!session ? <Card><Notice>Inicia sesión con una cuenta Cliente para consultar tus solicitudes.</Notice><Link href="/account" style={ui.link}>Ir a Mi cuenta</Link></Card> : <>
      {session.offline ? <Notice>Sin conexión. El historial requiere consultar el servidor y no se modifica sin confirmación.</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      <View style={ui.section}>
        <Heading eyebrow="Seguimiento">Pedidos aceptados</Heading>
        {trackingError ? <Notice tone="error">{trackingError}</Notice> : null}
        {trackingLoading && trackedOrders.length === 0 ? <Card><View style={ui.row}><ActivityIndicator color={palette.red} /><Text style={ui.body}>Consultando pedidos aceptados…</Text></View></Card> : null}
        {!trackingLoading && !trackingError && trackedOrders.length === 0 ? <Notice>Aún no tienes pedidos pickup aceptados para seguimiento.</Notice> : null}
        {trackedOrders.map((order) => <Card key={order.requestId}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <Text style={{ flex: 1, color: palette.ink, fontWeight: "800", fontSize: 17 }}>{order.orderCode}</Text>
            <Text style={ui.pill}>{orderStatusLabels[order.status] ?? "Estado actualizado"}</Text>
          </View>
          <Text style={ui.body}>Hora solicitada para recoger: {formatDate(order.requestedFor)}</Text>
          {order.estimatedReadyAt ? <Text style={[ui.body, { color: palette.ink, fontWeight: "700" }]}>Estimación de cocina: {formatDate(order.estimatedReadyAt)}</Text> : null}
          <Text style={ui.body}>Actualizado: {formatDate(order.updatedAt)}</Text>
        </Card>)}
        <Button title="Actualizar seguimiento" secondary busy={trackingLoading} onPress={() => void refreshTracking()} />
      </View>
      {loading && requests.length === 0 ? <Card><View style={ui.row}><ActivityIndicator color={palette.red} /><Text style={ui.body}>Cargando tus solicitudes…</Text></View></Card> : null}
      {!loading && !error && requests.length === 0 ? <Card><Notice>Aún no tienes solicitudes pickup.</Notice><Link href="/(tabs)/menu" style={ui.link}>Explorar menú</Link></Card> : null}
      {requests.map((item) => <Card key={item.requestId}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <Text style={{ flex: 1, color: palette.ink, fontWeight: "800", fontSize: 17 }}>{statusLabels[item.status] ?? "Estado actualizado"}</Text>
          <Text style={ui.pill}>{item.requestId.slice(0, 8)}</Text>
        </View>
        <Text style={ui.body}>Hora solicitada: {formatDate(item.requestedFor)}</Text>
        <Text style={[ui.body, { color: palette.ink, fontWeight: "700" }]}>Subtotal informado: {formatMoney(item.subtotal, item.currency)}</Text>
        <Text style={ui.body}>Preferencia de pago: {pickupPaymentLabel(item.paymentPreference)}</Text>
        {item.invoiceRequested ? <Text style={ui.body}>Factura solicitada para {item.invoiceName} · NIT {item.invoiceTaxId}. Aún no emitida.</Text> : null}
        <Text style={ui.body}>{item.message}</Text>
        {item.status === "REJECTED" && item.decisionReason ? <Notice tone="error">Motivo: {item.decisionReason}</Notice> : null}
        <Button title={details[item.requestId] ? "Ocultar productos" : "Ver productos"} secondary busy={loadingDetails === item.requestId} onPress={() => void toggleDetails(item.requestId)} />
        {details[item.requestId] ? <View style={ui.section}>
          {details[item.requestId].customerNote ? <Text style={ui.body}>Comentario: {details[item.requestId].customerNote}</Text> : null}
          {details[item.requestId].invoiceRequested ? <Text style={ui.body}>Datos fiscales solicitados: {details[item.requestId].invoiceName} · NIT {details[item.requestId].invoiceTaxId}</Text> : null}
          {details[item.requestId].items.map((line, index) => <View key={`${item.requestId}-${index}`} style={ui.row}>
            <Text style={[ui.body, { flex: 1 }]}>{line.quantity} × {line.name}</Text>
            <Text style={[ui.body, { color: palette.ink, fontWeight: "700" }]}>{formatMoney(line.lineTotal, item.currency)}</Text>
          </View>)}
        </View> : null}
        {item.status === "PENDING_REVIEW" ? <>
          <Notice>Esta solicitud todavía no es un pedido aceptado y no se ha cobrado.</Notice>
          <Button title="Cancelar solicitud" secondary busy={cancelling === item.requestId} disabled={Boolean(cancelling)} onPress={() => void cancel(item.requestId)} />
        </> : null}
      </Card>)}
      <Button title="Actualizar solicitudes" secondary busy={loading} onPress={() => void refresh()} />
    </>}
  </Page></ScrollView>;
}
