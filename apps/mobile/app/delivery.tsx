import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Button, Card, Field, Heading, Notice, Page, palette, ui } from "@/components/ui";
import { ApiError, apiRequest, DeliveryRequestBody, DeliveryRequestReceipt, PublicMenu, PublicMenuItem } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

type PendingAttempt = { email: string; key: string; body: DeliveryRequestBody };
const pendingKey = "wok.delivery.pending.v1";

function localDateTime(value: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export default function DeliveryScreen() {
  const { session, request } = useSession();
  const [menu, setMenu] = useState<PublicMenu | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [requestedFor, setRequestedFor] = useState("");
  const [address, setAddress] = useState("");
  const [reference, setReference] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [paymentPreference, setPaymentPreference] = useState<DeliveryRequestBody["paymentPreference"]>("CASH_ON_DELIVERY");
  const [pending, setPending] = useState<PendingAttempt | null>(null);
  const [receipt, setReceipt] = useState<DeliveryRequestReceipt | null>(null);
  const [history, setHistory] = useState<DeliveryRequestReceipt[]>([]);
  const [historyOwner, setHistoryOwner] = useState("");
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    Promise.allSettled([fetchMenu(), SecureStore.getItemAsync(pendingKey)])
      .then(([menuResult, attemptResult]) => {
        if (!active) return;
        if (menuResult.status === "fulfilled") setMenu(menuResult.value);
        else setError(menuResult.reason instanceof ApiError ? menuResult.reason.message : "No pudimos cargar el menú para delivery.");
        if (attemptResult.status === "fulfilled" && attemptResult.value) {
          try {
            const parsed = JSON.parse(attemptResult.value) as PendingAttempt;
            if (parsed.email && parsed.key && parsed.body?.items?.length) setPending(parsed);
            else void SecureStore.deleteItemAsync(pendingKey);
          } catch { void SecureStore.deleteItemAsync(pendingKey); }
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (!session) return () => { active = false; };
    void request<DeliveryRequestReceipt[]>("/api/v1/client/delivery-requests")
      .then((items) => { if (active) { setHistory(items); setHistoryOwner(session.email); setHistoryLoaded(true); setHistoryError(""); } })
      .catch((cause: unknown) => { if (active) { setHistoryError(cause instanceof ApiError ? cause.message : "No pudimos cargar tus solicitudes delivery."); setHistoryLoaded(true); } });
    return () => { active = false; };
  }, [request, session]);

  const products = useMemo(() => (menu?.categories ?? []).flatMap((category) => category.items), [menu]);
  const selected = products.filter((item) => (cart[item.id] ?? 0) > 0);
  const visibleHistory = session?.email === historyOwner ? history : [];

  function changeQuantity(item: PublicMenuItem, delta: number) {
    setCart((current) => {
      const next = { ...current };
      const quantity = (next[item.id] ?? 0) + delta;
      if (quantity < 1) delete next[item.id];
      else if (quantity <= 50) next[item.id] = quantity;
      return next;
    });
  }

  function suggestTime() {
    const prep = selected.reduce((sum, item) => sum + item.estimatedPreparationSeconds * cart[item.id], 0);
    const apiTime = Date.parse(menu?.asOf ?? "");
    if (!Number.isNaN(apiTime)) setRequestedFor(localDateTime(new Date(apiTime + Math.max(30 * 60, prep + 60) * 1000)));
  }

  async function submit(attempt?: PendingAttempt) {
    if (!session) { setError("Inicia sesión para enviar una solicitud de delivery."); return; }
    if (!attempt && (!selected.length || !address.trim() || !contactPhone.trim() || !requestedFor)) {
      setError("Completa productos, dirección, teléfono y horario solicitado."); return;
    }
    let activeAttempt: PendingAttempt;
    try {
      activeAttempt = attempt ?? {
        email: session.email,
        key: createIdempotencyKey(),
        body: {
          requestedFor: new Date(requestedFor).toISOString(), customerNote: customerNote.trim() || undefined,
          address: address.trim(), reference: reference.trim() || undefined, contactPhone: contactPhone.trim(),
          paymentPreference, items: selected.map((item) => ({ menuItemId: item.id, quantity: cart[item.id] })),
        },
      };
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo preparar la solicitud."); return;
    }
    if (activeAttempt.email !== session.email) { setError(`Inicia sesión con ${activeAttempt.email} para reintentar la solicitud protegida.`); return; }
    setSending(true); setError(""); setNotice("");
    try {
      await SecureStore.setItemAsync(pendingKey, JSON.stringify(activeAttempt));
      const result = await request<DeliveryRequestReceipt>("/api/v1/client/delivery-requests", {
        method: "POST", headers: { "Idempotency-Key": activeAttempt.key }, body: JSON.stringify(activeAttempt.body),
      });
      await SecureStore.deleteItemAsync(pendingKey);
      setPending(null); setReceipt(result); setHistory((current) => [result, ...current.filter((item) => item.requestId !== result.requestId)]); setHistoryOwner(session.email); setHistoryLoaded(true); setNotice("El restaurante recibió tu solicitud y debe revisar cobertura y disponibilidad.");
    } catch (cause) {
      setPending(activeAttempt);
      setError(cause instanceof ApiError ? cause.message : "No se confirmó el resultado. Reintenta la misma solicitud.");
    } finally { setSending(false); }
  }

  async function cancelRequest(requestId: string) {
    setCancelling(requestId); setError("");
    try {
      await request(`/api/v1/client/order-requests/${requestId}`, { method: "DELETE" });
      setHistory((current) => current.map((item) => item.requestId === requestId ? { ...item, status: "CANCELLED" } : item));
      setNotice("La solicitud pendiente quedó cancelada. No se había aceptado ni cobrado.");
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : "No pudimos cancelar la solicitud."); }
    finally { setCancelling(null); }
  }

  async function refreshHistory() {
    setHistoryLoading(true); setHistoryError("");
    try {
      const items = await request<DeliveryRequestReceipt[]>("/api/v1/client/delivery-requests");
      setHistory(items); setHistoryOwner(session?.email ?? ""); setHistoryLoaded(true);
    } catch (cause) { setHistoryError(cause instanceof ApiError ? cause.message : "No pudimos cargar tus solicitudes delivery."); }
    finally { setHistoryLoading(false); }
  }

  return <ScrollView contentContainerStyle={{ flexGrow: 1 }}><Page>
    <Heading eyebrow="Entrega a domicilio">Solicitar delivery</Heading>
    <Notice>El equipo debe confirmar cobertura, productos y horario. Esta solicitud no es un pedido aceptado, no reserva inventario y todavía no genera un cobro.</Notice>
    {session?.offline ? <Notice>Sin conexión: conserva la solicitud para reintentar manualmente cuando vuelva el acceso al servidor.</Notice> : null}
    {error ? <Notice tone="error">{error}</Notice> : null}
    {notice ? <Notice tone="success">{notice}</Notice> : null}
    {receipt ? <Card><Text style={{ color: palette.ink, fontWeight: "800" }}>Solicitud recibida · {receipt.requestId.slice(0, 8)}</Text><Text style={ui.body}>Estado: pendiente de revisión. Preferencia de pago: {paymentLabel(receipt.paymentPreference)}. No se ha realizado ningún pago.</Text></Card> : null}
    {session ? <Card>
      <Heading eyebrow="Historial">Tus solicitudes delivery</Heading>
      {historyError ? <Notice tone="error">{historyError}</Notice> : null}
      {(!historyLoaded || historyLoading) && !visibleHistory.length ? <Text style={ui.body}>Cargando solicitudes…</Text> : null}
      {historyLoaded && !historyLoading && !visibleHistory.length ? <Text style={ui.body}>Aún no tienes solicitudes delivery.</Text> : null}
      {visibleHistory.map((item) => <View key={item.requestId} style={{ borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 12, gap: 8 }}>
        <Text style={{ color: palette.ink, fontWeight: "800" }}>Solicitud {item.requestId.slice(0, 8)} · {requestStatus(item.status)}</Text>
        <Text style={ui.body}>{formatMoney(item.subtotal, item.currency)} · {paymentLabel(item.paymentPreference)}</Text>
        {item.status === "PENDING_REVIEW" ? <Button title="Cancelar solicitud" secondary busy={cancelling === item.requestId} disabled={Boolean(cancelling)} onPress={() => void cancelRequest(item.requestId)} /> : null}
      </View>)}
      <Button title="Actualizar historial" secondary busy={historyLoading} onPress={() => void refreshHistory()} />
    </Card> : null}
    {pending ? <Card><Notice>Hay una solicitud sin resultado confirmado, protegida para {pending.email}. Reintenta el mismo contenido para evitar duplicados.</Notice>
      {session?.email === pending.email ? <Button title="Reintentar solicitud delivery" busy={sending} onPress={() => void submit(pending)} /> : null}</Card> : null}
    {loading ? <Card><Text style={ui.body}>Cargando menú oficial…</Text></Card> : null}
    {!loading && !products.length && !error ? <Card><Text style={{ color: palette.ink, fontWeight: "800" }}>Aún no hay productos publicados</Text><Text style={ui.body}>El catálogo aparecerá cuando el restaurante publique su menú.</Text></Card> : null}
    {products.map((item) => <Card key={item.id}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}><Text style={{ flex: 1, color: palette.ink, fontWeight: "800" }}>{item.name}</Text><Text style={{ color: palette.red, fontWeight: "800" }}>{formatMoney(item.price, item.currency)}</Text></View>
      {item.description ? <Text style={ui.body}>{item.description}</Text> : null}
      <View style={ui.row}><Button title="−" secondary disabled={!cart[item.id]} onPress={() => changeQuantity(item, -1)} /><Text style={ui.body}>{cart[item.id] ?? 0}</Text><Button title="Agregar" disabled={Boolean(pending)} onPress={() => changeQuantity(item, 1)} /></View>
    </Card>)}
    {!pending ? <Card>
      <Heading eyebrow="Datos de entrega">¿A dónde lo llevamos?</Heading>
      <Field label="Dirección completa" value={address} onChangeText={setAddress} multiline maxLength={500} placeholder="Zona, calle/avenida, número o referencias de ubicación" />
      <Field label="Referencia para encontrar el lugar (opcional)" value={reference} onChangeText={setReference} maxLength={300} placeholder="Color de portón, nivel, local…" />
      <Field label="Teléfono de contacto" value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" maxLength={32} placeholder="+502 0000-0000" />
      <Button title="Efectivo al recibir" secondary={paymentPreference !== "CASH_ON_DELIVERY"} onPress={() => setPaymentPreference("CASH_ON_DELIVERY")} />
      <Button title="Solicitar pago en línea" secondary={paymentPreference !== "ONLINE_PAYMENT_REQUESTED"} onPress={() => setPaymentPreference("ONLINE_PAYMENT_REQUESTED")} />
      {paymentPreference === "ONLINE_PAYMENT_REQUESTED" ? <Notice>Esta opción sólo registra tu preferencia. El cobro en línea no está habilitado aquí.</Notice> : null}
      <Field label="Horario que prefieres (hora local)" value={requestedFor} onChangeText={setRequestedFor} placeholder="AAAA-MM-DDTHH:mm" />
      <Button title="Sugerir horario inicial" secondary onPress={suggestTime} disabled={!selected.length} />
      <Field label="Comentarios para el restaurante (opcional)" value={customerNote} onChangeText={setCustomerNote} maxLength={500} multiline />
      {selected.length === 0 ? <Notice>Agrega al menos un producto.</Notice> : null}
      <Button title="Enviar solicitud de delivery" busy={sending} disabled={!session || !selected.length} onPress={() => void submit()} />
    </Card> : null}
  </Page></ScrollView>;
}

async function fetchMenu() {
  return apiRequest<PublicMenu>("/api/v1/public/menu");
}

function createIdempotencyKey() {
  return Crypto.randomUUID();
}

function formatMoney(value: number, currency: string) {
  try { return new Intl.NumberFormat("es-GT", { style: "currency", currency }).format(value); }
  catch { return `${currency} ${value.toFixed(2)}`; }
}

function paymentLabel(value: DeliveryRequestBody["paymentPreference"]) {
  return value === "CASH_ON_DELIVERY" ? "efectivo al recibir" : "solicitud de pago en línea";
}

function requestStatus(value: DeliveryRequestReceipt["status"]) {
  const labels: Record<DeliveryRequestReceipt["status"], string> = {
    PENDING_REVIEW: "pendiente de revisión", ACCEPTED: "aceptada", REJECTED: "no aceptada",
    CANCELLED: "cancelada", EXPIRED: "vencida",
  };
  return labels[value];
}
