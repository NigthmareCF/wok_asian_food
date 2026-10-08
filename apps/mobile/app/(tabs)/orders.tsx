import { Link } from "expo-router";
import * as Crypto from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { Button, Card, Heading, Notice, Page, palette, ui } from "@/components/ui";
import { CancellableOrderItem, DeliveryRequestReceipt, OrderChangeRequestReceipt, PaymentIntentReceipt, PickupOrderTracking, PickupRequestDetails, PickupRequestState } from "@/lib/api";
import { useSession } from "@/providers/session-provider";
import { recoverCurrentPaymentIntents } from "@/lib/payment-intents";
import { useFocusedPolling } from "@/lib/use-focused-polling";
import { OrderChangeAttempt, parseOrderChangeAttempts, removeOrderChangeAttempt, resolveOrderChangeAttempt } from "@/lib/order-change-attempts";
import { deleteSecurePayload, readSecurePayload, saveSecurePayload } from "@/lib/reservation-attempt-storage";
import { canSubmitPaymentEvidence, PaymentEvidenceStatus } from "@/lib/payment-evidence-policy";

const orderChangeAttemptsKey = "wok.client.order-change-attempts.v1";

const statusLabels: Record<PickupRequestState["status"], string> = {
  PENDING_REVIEW: "Pendiente de revisión", ACCEPTED: "Aceptada por el restaurante",
  REJECTED: "No aceptada", CANCELLED: "Cancelada", EXPIRED: "Vencida",
};
const orderStatusLabels: Record<PickupOrderTracking["status"], string> = {
  SENT: "Recibido por cocina", PREPARING: "En preparación", READY: "Listo para recoger",
  SERVED: "Entregado", CLOSED: "Cerrado", CANCELLED: "Cancelado",
};
const deliveryStatusLabels: Record<NonNullable<DeliveryRequestReceipt["dispatchStatus"]>, string> = {
  AWAITING_KITCHEN: "En preparación", READY_FOR_DISPATCH: "Esperando repartidor",
  ASSIGNED: "Repartidor asignado", OUT_FOR_DELIVERY: "En camino",
  DELIVERY_FAILED: "El equipo revisa una incidencia", DELIVERED: "Entregado", CANCELLED: "Cancelado",
};
const paymentStatusLabels: Record<PaymentIntentReceipt["status"], string> = {
  CREATED: "inicializando", PENDING: "pendiente", REQUIRES_ACTION: "requiere acción",
  AUTHORIZED: "autorizado", CAPTURED: "confirmado por el proveedor", FAILED: "rechazado",
  CANCELLED: "cancelado", UNKNOWN: "en verificación", REFUNDED: "reembolsado",
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
function deliveryPaymentLabel(value: DeliveryRequestReceipt["paymentPreference"]) {
  return value === "ONLINE_PAYMENT_REQUESTED" ? "Cobro online solicitado" : "Efectivo contra entrega";
}

export default function PickupRequestsScreen() {
  const { session } = useSession();
  return <OrderHistory key={session?.email ?? "guest"} />;
}

function OrderHistory() {
  const { session, request } = useSession();
  const [requests, setRequests] = useState<PickupRequestState[]>([]);
  const [deliveryRequests, setDeliveryRequests] = useState<DeliveryRequestReceipt[]>([]);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [deliveryError, setDeliveryError] = useState("");
  const [trackedOrders, setTrackedOrders] = useState<PickupOrderTracking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [details, setDetails] = useState<Record<string, PickupRequestDetails>>({});
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState("");
  const [creatingPaymentIntentFor, setCreatingPaymentIntentFor] = useState<string | null>(null);
  const [paymentIntents, setPaymentIntents] = useState<Record<string, PaymentIntentReceipt>>({});
  const [paymentIntentUnavailable, setPaymentIntentUnavailable] = useState<Record<string, boolean>>({});
  const [changeRequests, setChangeRequests] = useState<OrderChangeRequestReceipt[]>([]);
  const [cancellableItems, setCancellableItems] = useState<Record<string, CancellableOrderItem[]>>({});
  const [loadingCancellableItems, setLoadingCancellableItems] = useState<string | null>(null);
  const changeRequestsRef = useRef<OrderChangeRequestReceipt[]>([]);
  const cancellationAttempts = useRef<OrderChangeAttempt[]>([]);
  const [cancellationAttemptsReady, setCancellationAttemptsReady] = useState(false);
  const [cancellationStorageError, setCancellationStorageError] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [selectedChangeRequest, setSelectedChangeRequest] = useState<string | null>(null);
  const [submittingChange, setSubmittingChange] = useState<string | null>(null);

  const restoreCancellationAttempts = useCallback(async () => {
    if (!session?.email || Platform.OS === "web") {
      cancellationAttempts.current = [];
      setCancellationAttemptsReady(true);
      setCancellationStorageError("");
      return;
    }
    setCancellationAttemptsReady(false);
    setCancellationStorageError("");
    try {
      const raw = await readSecurePayload(orderChangeAttemptsKey);
      const parsed = raw ? parseOrderChangeAttempts(raw) : [];
      cancellationAttempts.current = parsed;
      if (raw && JSON.stringify(parsed) !== raw) {
        if (parsed.length) await saveSecurePayload(orderChangeAttemptsKey, JSON.stringify(parsed));
        else await deleteSecurePayload(orderChangeAttemptsKey);
      }
      setCancellationAttemptsReady(true);
    } catch {
      setCancellationStorageError("No pudimos recuperar de forma segura el estado de tus solicitudes. Reintenta antes de enviar otra cancelación.");
    }
  }, [session?.email]);

  useEffect(() => { void Promise.resolve().then(restoreCancellationAttempts); }, [restoreCancellationAttempts]);

  const refresh = useCallback(async () => {
    if (!session) { setRequests([]); setError(""); return; }
    setLoading(true); setError("");
    try { setRequests(await request<PickupRequestState[]>("/api/v1/client/order-requests")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos cargar tus solicitudes."); }
    finally { setLoading(false); }
  }, [request, session]);

  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);

  const refreshDelivery = useCallback(async () => {
    if (!session || session.offline) { setDeliveryRequests([]); setPaymentIntents({}); setPaymentIntentUnavailable({}); setDeliveryError(""); return; }
    setDeliveryLoading(true); setDeliveryError("");
    try {
      const deliveries = await request<DeliveryRequestReceipt[]>("/api/v1/client/delivery-requests");
      setDeliveryRequests(deliveries);
      const recovered = await recoverCurrentPaymentIntents(deliveries, (requestId) =>
        request<PaymentIntentReceipt | null>(`/api/v1/client/delivery-requests/${requestId}/payment-intents/current`),
      );
      setPaymentIntents(recovered.current);
      setPaymentIntentUnavailable(Object.fromEntries(recovered.unavailableRequestIds.map((requestId) => [requestId, true])));
    }
    catch (cause) { setDeliveryError(cause instanceof Error ? cause.message : "No pudimos cargar tus solicitudes delivery."); }
    finally { setDeliveryLoading(false); }
  }, [request, session]);

  useEffect(() => { void Promise.resolve().then(refreshDelivery); }, [refreshDelivery]);
  useFocusedPolling(refreshDelivery, 30_000, Boolean(session && !session.offline && (
    deliveryRequests.some((item) => item.status === "ACCEPTED" && item.dispatchStatus !== "DELIVERED" && item.dispatchStatus !== "CANCELLED")
      || Object.values(paymentIntents).some((intent) => intent.status === "CREATED")
  )));

  const refreshTracking = useCallback(async () => {
    if (!session || session.offline) { setTrackedOrders([]); setTrackingError(""); return; }
    setTrackingLoading(true); setTrackingError("");
    try { setTrackedOrders(await request<PickupOrderTracking[]>("/api/v1/client/orders/tracking")); }
    catch (cause) { setTrackingError(cause instanceof Error ? cause.message : "No pudimos actualizar el seguimiento."); }
    finally { setTrackingLoading(false); }
  }, [request, session]);

  useEffect(() => { void Promise.resolve().then(refreshTracking); }, [refreshTracking]);

  const refreshChangeRequests = useCallback(async () => {
    if (!session || session.offline) { setChangeRequests([]); return; }
    try {
      const next = await request<OrderChangeRequestReceipt[]>("/api/v1/client/order-requests/change-requests");
      const wasPending = changeRequestsRef.current.some((item) => item.status === "PENDING_REVIEW");
      const decisionArrived = wasPending && next.some((item) => item.status === "APPROVED" || item.status === "REJECTED");
      changeRequestsRef.current = next;
      setChangeRequests(next);
      if (decisionArrived) void Promise.all([refresh(), refreshDelivery(), refreshTracking()]);
    }
    catch { /* Keep order tracking usable when the optional review history is unavailable. */ }
  }, [refresh, refreshDelivery, refreshTracking, request, session]);

  useEffect(() => { void Promise.resolve().then(refreshChangeRequests); }, [refreshChangeRequests]);
  const refreshOrderUpdates = useCallback(() => {
    void refreshTracking();
    void refreshChangeRequests();
  }, [refreshChangeRequests, refreshTracking]);
  useFocusedPolling(refreshOrderUpdates, 30_000, Boolean(session && !session.offline &&
    (trackedOrders.some((order) => order.status === "SENT" || order.status === "PREPARING" || order.status === "READY")
      || changeRequests.some((item) => item.status === "PENDING_REVIEW"))));

  async function cancel(requestId: string) {
    setCancelling(requestId); setError(""); setNotice("");
    try {
      await request<{ requestId: string; status: PickupRequestState["status"] }>(`/api/v1/client/order-requests/${requestId}`, { method: "DELETE" });
      setNotice("Cancelamos tu solicitud. No se había confirmado un pedido ni realizado un cobro.");
      await Promise.all([refresh(), refreshDelivery()]);
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

  async function requestPaymentIntent(requestId: string) {
    if (session?.offline) { setDeliveryError("Conéctate para consultar el estado de pago en el servidor."); return; }
    setCreatingPaymentIntentFor(requestId); setDeliveryError("");
    try {
      const result = await request<PaymentIntentReceipt>(
        `/api/v1/client/delivery-requests/${requestId}/payment-intents`,
        { method: "POST", headers: { "Idempotency-Key": Crypto.randomUUID() }, body: "{}" },
      );
      setPaymentIntents((current) => ({ ...current, [requestId]: result }));
    } catch (cause) {
      setDeliveryError(cause instanceof Error ? cause.message : "No pudimos consultar el intento de pago.");
    } finally { setCreatingPaymentIntentFor(null); }
  }

  function changeRequestFor(orderRequestId: string, orderItemId: string | null = null) {
    return changeRequests.find((item) => item.orderRequestId === orderRequestId &&
      (orderItemId === null ? item.requestType === "CANCEL_ORDER" :
        item.requestType === "CANCEL_LINE" && item.orderItemId === orderItemId));
  }

  function changeSelectionKey(orderRequestId: string, orderItemId: string | null = null) {
    return `${orderRequestId}:${orderItemId ?? "order"}`;
  }

  async function loadCancellableItems(orderRequestId: string) {
    if (session?.offline) { setError("Conéctate para consultar qué productos todavía se pueden cancelar."); return; }
    if (cancellableItems[orderRequestId]) {
      setCancellableItems((current) => { const next = { ...current }; delete next[orderRequestId]; return next; });
      return;
    }
    setLoadingCancellableItems(orderRequestId); setError("");
    try {
      const result = await request<CancellableOrderItem[]>(
        `/api/v1/client/order-requests/${orderRequestId}/change-requests/cancellable-items`,
      );
      setCancellableItems((current) => ({ ...current, [orderRequestId]: result }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos consultar los productos cancelables."); }
    finally { setLoadingCancellableItems(null); }
  }

  async function submitCancellation(orderRequestId: string, orderItemId: string | null = null) {
    const selectionKey = changeSelectionKey(orderRequestId, orderItemId);
    if (!cancellationAttemptsReady) {
      setError("Estamos recuperando el estado de la solicitud. Espera un momento e inténtalo de nuevo.");
      return;
    }
    const reason = changeReason.trim();
    if (reason.length < 3) { setError(orderItemId ? "Describe brevemente por qué solicitas cancelar este producto." : "Describe brevemente por qué solicitas cancelar el pedido."); return; }
    setSubmittingChange(selectionKey); setError(""); setNotice("");
    const nextAttempts = resolveOrderChangeAttempt(cancellationAttempts.current, session?.email ?? "", orderRequestId,
      reason, () => Crypto.randomUUID(), undefined, orderItemId);
    const attempt = nextAttempts.find((item) => item.orderRequestId === orderRequestId &&
      (item.orderItemId ?? null) === orderItemId &&
      item.ownerEmail.trim().toLowerCase() === (session?.email ?? "").trim().toLowerCase());
    if (!attempt) { setSubmittingChange(null); setError("No pudimos preparar una solicitud segura. Inténtalo de nuevo."); return; }
    try {
      if (Platform.OS !== "web") await saveSecurePayload(orderChangeAttemptsKey, JSON.stringify(nextAttempts));
      cancellationAttempts.current = nextAttempts;
      const receipt = await request<OrderChangeRequestReceipt>(
        orderItemId
          ? `/api/v1/client/order-requests/${orderRequestId}/change-requests/items/${orderItemId}/cancellations`
          : `/api/v1/client/order-requests/${orderRequestId}/change-requests`,
        { method: "POST", headers: { "Idempotency-Key": attempt.key }, body: JSON.stringify({ reason: attempt.reason }) },
      );
      const next = [receipt, ...changeRequestsRef.current.filter((item) => !(item.orderRequestId === orderRequestId &&
        (item.orderItemId ?? null) === orderItemId && item.requestType === (orderItemId ? "CANCEL_LINE" : "CANCEL_ORDER")))];
      changeRequestsRef.current = next;
      setChangeRequests(next);
      await clearCancellationAttempt(orderRequestId, orderItemId);
      setSelectedChangeRequest(null); setChangeReason("");
      setNotice(orderItemId ? "Enviamos la solicitud para cancelar este producto. El pedido continúa activo mientras el equipo la revisa." : "Enviamos tu solicitud al equipo. El pedido sigue activo hasta que el equipo la revise.");
    } catch (cause) {
      await refreshChangeRequests();
      const recovered = changeRequestsRef.current.find((item) => item.orderRequestId === orderRequestId &&
        (item.orderItemId ?? null) === orderItemId && item.requestType === (orderItemId ? "CANCEL_LINE" : "CANCEL_ORDER"));
      if (recovered) {
        await clearCancellationAttempt(orderRequestId, orderItemId);
        setSelectedChangeRequest(null); setChangeReason("");
        setNotice(recovered.status === "PENDING_REVIEW"
          ? "La solicitud quedó registrada y espera revisión. El pedido sigue activo mientras tanto."
          : `Recuperamos el resultado de la solicitud: ${recovered.status === "APPROVED" ? "cancelación aprobada" : "cancelación no aceptada"}.`);
      } else {
        setError(cause instanceof Error ? cause.message : "No pudimos enviar la solicitud. Puedes reintentar de forma segura.");
      }
    }
    finally { setSubmittingChange(null); }
  }

  async function clearCancellationAttempt(orderRequestId: string, orderItemId: string | null = null) {
    const next = removeOrderChangeAttempt(cancellationAttempts.current, session?.email ?? "", orderRequestId, orderItemId);
    cancellationAttempts.current = next;
    if (Platform.OS === "web") return;
    try {
      if (next.length) await saveSecurePayload(orderChangeAttemptsKey, JSON.stringify(next));
      else await deleteSecurePayload(orderChangeAttemptsKey);
    } catch {
      // Keeping a completed idempotency key is safe; the next retry will replay the same server result.
    }
  }

  function cancellationControls(orderRequestId: string, orderItemId: string | null = null) {
    const change = changeRequestFor(orderRequestId, orderItemId);
    if (change?.status === "PENDING_REVIEW") return <Notice>Solicitud de cancelación pendiente de revisión. El pedido continúa activo.</Notice>;
    if (change?.status === "APPROVED") return <Notice>El equipo aprobó la cancelación del pedido.</Notice>;
    if (change?.status === "REJECTED") return <View style={ui.section}>
      <Notice tone="error">El equipo no aceptó la cancelación.{change.decisionReason ? ` Motivo: ${change.decisionReason}` : ""}</Notice>
      <Button title="Solicitar nuevamente" secondary disabled={Boolean(submittingChange) || Boolean(session?.offline) || !cancellationAttemptsReady}
        onPress={() => { setError(""); setSelectedChangeRequest(changeSelectionKey(orderRequestId, orderItemId)); }} />
    </View>;
    const selectionKey = changeSelectionKey(orderRequestId, orderItemId);
    if (selectedChangeRequest === selectionKey) return <View style={ui.section}>
      <Text style={ui.body}>{orderItemId ? "El producto no se cancela automáticamente; el equipo revisará tu solicitud." : "El pedido no se cancela automáticamente. El equipo revisará tu solicitud."}</Text>
      <TextInput accessibilityLabel={orderItemId ? "Motivo para cancelar el producto" : "Motivo de cancelación"} placeholder="Motivo (mínimo 3 caracteres)" value={changeReason}
        onChangeText={setChangeReason} multiline maxLength={500}
        style={{ minHeight: 72, borderWidth: 1, borderColor: palette.line, borderRadius: 12, padding: 12, color: palette.ink, textAlignVertical: "top" }} />
      <Button title="Enviar solicitud" busy={submittingChange === selectionKey} disabled={Boolean(submittingChange) || Boolean(session?.offline) || !cancellationAttemptsReady}
        onPress={() => void submitCancellation(orderRequestId, orderItemId)} />
      <Button title="Volver" secondary onPress={() => { setSelectedChangeRequest(null); setChangeReason(""); }} />
    </View>;
    return <Button title={orderItemId ? "Solicitar cancelar este producto" : "Solicitar cancelación del pedido"} secondary disabled={Boolean(submittingChange) || Boolean(session?.offline) || !cancellationAttemptsReady}
      onPress={() => { setError(""); setSelectedChangeRequest(selectionKey); }} />;
  }

  function lineCancellationSection(orderRequestId: string) {
    const lines = cancellableItems[orderRequestId];
    return <View style={ui.section}>
      <Button title={lines ? "Ocultar productos cancelables" : "Solicitar cancelar un producto"} secondary
        busy={loadingCancellableItems === orderRequestId} disabled={Boolean(loadingCancellableItems) || Boolean(session?.offline)}
        onPress={() => void loadCancellableItems(orderRequestId)} />
      {lines?.length === 0 ? <Notice>No hay productos que se puedan cancelar desde la app. Contacta al equipo si necesitas ayuda.</Notice> : null}
      {lines?.map((line) => <View key={line.orderItemId} style={ui.section}>
        <Text style={ui.body}>{line.quantity} × {line.name}</Text>
        {cancellationControls(orderRequestId, line.orderItemId)}
      </View>)}
    </View>;
  }

  return <ScrollView contentContainerStyle={{ flexGrow: 1 }}><Page>
    <Heading eyebrow="Cliente">Mis pedidos y solicitudes</Heading>
    <Text style={ui.body}>Revisa pickup y delivery, su seguimiento y las solicitudes pendientes de confirmación.</Text>
    {!session ? <Card><Notice>Inicia sesión con una cuenta Cliente para consultar tus solicitudes.</Notice><Link href="/account" style={ui.link}>Ir a Mi cuenta</Link></Card> : <>
      {session.offline ? <Notice>Sin conexión. El historial requiere consultar el servidor y no se modifica sin confirmación.</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {cancellationStorageError ? <View style={ui.section}><Notice tone="error">{cancellationStorageError}</Notice>
        <Button title="Reintentar recuperación segura" secondary onPress={() => void restoreCancellationAttempts()} /></View> : null}
      <View style={ui.section}>
        <Heading eyebrow="Pickup">Pedidos aceptados</Heading>
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
          {order.status === "SENT" || order.status === "PREPARING" || order.status === "READY"
            ? cancellationControls(order.requestId) : null}
          {order.status === "SENT" ? lineCancellationSection(order.requestId) : null}
        </Card>)}
        <Button title="Actualizar seguimiento" secondary busy={trackingLoading} onPress={() => void Promise.all([refreshTracking(), refreshChangeRequests()])} />
      </View>
      <View style={ui.section}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <Heading eyebrow="Delivery">Solicitudes a domicilio</Heading>
          <Link href="/delivery" style={ui.link}>Pedir</Link>
        </View>
        {deliveryError ? <Notice tone="error">{deliveryError}</Notice> : null}
        {deliveryLoading && deliveryRequests.length === 0 ? <Card><View style={ui.row}><ActivityIndicator color={palette.red} /><Text style={ui.body}>Consultando delivery…</Text></View></Card> : null}
        {!deliveryLoading && !deliveryError && deliveryRequests.length === 0 ? <Notice>Aún no tienes solicitudes a domicilio.</Notice> : null}
        {deliveryRequests.map((item) => <Card key={item.requestId}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <Text style={{ flex: 1, color: palette.ink, fontWeight: "800", fontSize: 17 }}>
              {item.orderCode ? "Pedido " + item.orderCode : "Solicitud " + item.requestId.slice(0, 8)}
            </Text>
            <Text style={ui.pill}>{statusLabels[item.status] ?? "Estado actualizado"}</Text>
          </View>
          <Text style={ui.body}>Horario solicitado: {formatDate(item.requestedFor)}</Text>
          <Text style={ui.body}>Total informado: {formatMoney(item.subtotal, item.currency)} · {deliveryPaymentLabel(item.paymentPreference)}</Text>
          {item.orderCode && item.orderStatus ? <Notice tone="success">Pedido aceptado · {orderStatusLabels[item.orderStatus] ?? "Estado actualizado"}{item.estimatedReadyAt ? " · Estimación de cocina " + formatDate(item.estimatedReadyAt) : ""}</Notice> : null}
          {item.dispatchStatus ? <Notice tone={item.dispatchStatus === "DELIVERY_FAILED" ? "error" : "info"}>
            Reparto: {deliveryStatusLabels[item.dispatchStatus]}.{item.assignedAt ? " Asignado " + formatDate(item.assignedAt) + "." : ""}{item.dispatchedAt ? " Salió del restaurante " + formatDate(item.dispatchedAt) + "." : ""}{item.deliveredAt ? " Entregado " + formatDate(item.deliveredAt) + "." : ""}
          </Notice> : null}
          {item.status === "ACCEPTED" && item.orderStatus && ["SENT", "PREPARING", "READY"].includes(item.orderStatus)
            && ["AWAITING_KITCHEN", "READY_FOR_DISPATCH"].includes(item.dispatchStatus ?? "")
            ? cancellationControls(item.requestId) : null}
          {item.status === "ACCEPTED" && item.orderStatus === "SENT"
            && ["AWAITING_KITCHEN", "READY_FOR_DISPATCH"].includes(item.dispatchStatus ?? "")
            ? lineCancellationSection(item.requestId) : null}
          {item.invoiceRequested ? <Text style={ui.body}>Factura solicitada para {item.invoiceName} · NIT {item.invoiceTaxId}; todavía no emitida.</Text> : null}
          {paymentIntentUnavailable[item.requestId] ? <Notice tone="error">No pudimos consultar el estado de pago de esta solicitud. Puedes reintentar la actualización sin afectar las demás.</Notice> : null}
          {paymentIntents[item.requestId] ? <Notice>Pago {paymentStatusLabels[paymentIntents[item.requestId].status]} · {formatMoney(paymentIntents[item.requestId].amount, paymentIntents[item.requestId].currency)}. {paymentIntents[item.requestId].message}</Notice> : null}
          {item.status === "ACCEPTED" && item.paymentPreference === "ONLINE_PAYMENT_REQUESTED"
            && item.orderStatus !== "CLOSED" && item.orderStatus !== "CANCELLED" ? <>
              <Notice>La solicitud de pago usa un adaptador de prueba. Esta app no procesa pagos ni confirma cobros.</Notice>
              <Button title="Solicitar estado de pago de prueba" secondary busy={creatingPaymentIntentFor === item.requestId}
                disabled={Boolean(creatingPaymentIntentFor) || Boolean(session?.offline)}
                onPress={() => void requestPaymentIntent(item.requestId)} />
            </> : null}
          {item.status === "REJECTED" && item.decisionReason ? <Notice tone="error">Motivo: {item.decisionReason}</Notice> : null}
          {item.status === "PENDING_REVIEW" ? <>
            <Notice>La solicitud aún no es un pedido aceptado y no se ha cobrado.</Notice>
            <Button title="Cancelar solicitud" secondary busy={cancelling === item.requestId} disabled={Boolean(cancelling)} onPress={() => void cancel(item.requestId)} />
          </> : null}
          <Link href="/delivery" style={ui.link}>Ver formulario y detalle de delivery</Link>
        </Card>)}
        <Button title="Actualizar delivery" secondary busy={deliveryLoading} onPress={() => void Promise.all([refreshDelivery(), refreshChangeRequests()])} />
      </View>
      {loading && requests.length === 0 ? <Card><View style={ui.row}><ActivityIndicator color={palette.red} /><Text style={ui.body}>Cargando tus solicitudes…</Text></View></Card> : null}
      <Heading eyebrow="Pickup">Solicitudes para recoger</Heading>
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
            <Text style={[ui.body, { flex: 1 }]}>{line.quantity} × {line.name}{line.modifiers?.length
              ? ` · ${line.modifiers.map((modifier) => `${modifier.group}: ${modifier.name}`).join(", ")}` : ""}</Text>
            <Text style={[ui.body, { color: palette.ink, fontWeight: "700" }]}>{formatMoney(line.lineTotal, item.currency)}</Text>
          </View>)}
        </View> : null}
        {item.status === "PENDING_REVIEW" ? <>
          <Notice>Esta solicitud todavía no es un pedido aceptado y no se ha cobrado.</Notice>
          <Button title="Cancelar solicitud" secondary busy={cancelling === item.requestId} disabled={Boolean(cancelling)} onPress={() => void cancel(item.requestId)} />
        </> : null}
        {item.paymentPreference === "TRANSFER_AT_PICKUP"
          && (item.status === "PENDING_REVIEW" || item.status === "ACCEPTED")
          ? <TransferEvidencePanel requestId={item.requestId} request={request} /> : null}
      </Card>)}
      <Button title="Actualizar solicitudes" secondary busy={loading || deliveryLoading} onPress={() => void Promise.all([refresh(), refreshDelivery(), refreshTracking(), refreshChangeRequests()])} />
    </>}
  </Page></ScrollView>;
}

type EvidenceReceipt = {
  id: string;
  orderRequestId: string;
  status: PaymentEvidenceStatus;
  contentType: string;
  byteSize: number;
  createdAt: string;
  version: number;
  reviewReason: string | null;
};

function TransferEvidencePanel({ requestId, request }: {
  requestId: string;
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
}) {
  const [evidence, setEvidence] = useState<EvidenceReceipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [lookupError, setLookupError] = useState("");
  const [selected, setSelected] = useState<{ asset: ImagePicker.ImagePickerAsset; key: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLookupError("");
    try {
      setEvidence(await request<EvidenceReceipt[]>(`/api/v1/client/order-requests/${requestId}/payment-evidence`));
      setLoaded(true);
    } catch (cause) {
      setLoaded(false);
      setLookupError(cause instanceof Error ? cause.message : "No pudimos consultar el comprobante.");
    } finally { setLoading(false); }
  }, [request, requestId]);

  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);

  async function chooseImage() {
    setError(""); setMessage("");
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"], allowsEditing: false, quality: 0.85,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (asset.fileSize != null && asset.fileSize > 8 * 1024 * 1024) {
        setError("La imagen supera el límite de 8 MB."); return;
      }
      if (asset.mimeType && !["image/jpeg", "image/png"].includes(asset.mimeType.toLowerCase())) {
        setError("Elige una imagen JPG o PNG."); return;
      }
      setSelected({ asset, key: Crypto.randomUUID() });
    } catch {
      setError("No pudimos abrir tus imágenes. Revisa los permisos e inténtalo de nuevo.");
    }
  }

  async function upload() {
    if (!selected) return;
    const mimeType = selected.asset.mimeType?.toLowerCase();
    if (mimeType !== "image/jpeg" && mimeType !== "image/png") {
      setError("El archivo no indica un formato JPG o PNG compatible."); return;
    }
    setUploading(true); setError(""); setMessage("");
    try {
      const form = new FormData();
      const filename = mimeType === "image/png" ? "comprobante.png" : "comprobante.jpg";
      const payload = selected.asset.file ?? { uri: selected.asset.uri, name: filename, type: mimeType };
      form.append("file", payload as Blob);
      await request<EvidenceReceipt>(`/api/v1/client/order-requests/${requestId}/payment-evidence`, {
        method: "POST", headers: { "Idempotency-Key": selected.key }, body: form,
      });
      setSelected(null);
      setMessage("Comprobante enviado. El equipo debe confirmar el pago; adjuntarlo no lo acredita automáticamente.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos enviar el comprobante. Puedes reintentar.");
      await refresh();
    } finally { setUploading(false); }
  }

  const current = evidence[0];
  const status = current?.status === "VERIFIED" ? "Pago revisado y registrado por el restaurante"
    : current?.status === "REJECTED" ? "Comprobante rechazado; contacta al restaurante para coordinar otro medio"
      : current?.status === "NEEDS_REVIEW" ? "Comprobante recibido, pendiente de revisión"
        : "No has enviado un comprobante";

  const canUpload = canSubmitPaymentEvidence(loaded, current?.status);
  return <View style={ui.section}>
    <Text style={[ui.body, { color: palette.ink, fontWeight: "700" }]}>Transferencia</Text>
    {loading ? <View style={ui.row}><ActivityIndicator color={palette.red} /><Text style={ui.body}>Consultando revisión…</Text></View>
      : loaded ? <Notice tone={current?.status === "VERIFIED" ? "success" : current?.status === "REJECTED" ? "error" : "info"}>{status}</Notice>
        : <Notice tone="error">No pudimos confirmar si ya enviaste un comprobante. Consulta el estado antes de intentar otro envío.</Notice>}
    {message ? <Notice tone="success">{message}</Notice> : null}
    {error ? <Notice tone="error">{error}</Notice> : null}
    {lookupError ? <Notice tone="error">{lookupError}</Notice> : null}
    {current?.status === "REJECTED" && current.reviewReason
      ? <Notice tone="error">Motivo de rechazo: {current.reviewReason}</Notice> : null}
    {!loaded ? <Button title="Consultar comprobantes" secondary busy={loading} onPress={() => void refresh()} /> : null}
    {canUpload ? <>
      <Button title={selected ? `Imagen: ${selected.asset.fileName ?? "comprobante seleccionado"}` : "Elegir comprobante JPG o PNG"}
        secondary onPress={() => void chooseImage()} disabled={uploading || loading} />
      {selected ? <Button title="Enviar para revisión" onPress={() => void upload()} busy={uploading} disabled={uploading || loading} /> : null}
    </> : null}
  </View>;
}
