import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { Link } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { Button, Card, Field, Heading, Notice, Page, palette, ui } from "@/components/ui";
import { useSession } from "@/providers/session-provider";
import { ApiError, apiRequest, CustomerTaxProfile, PickupRequestBody, PickupRequestReceipt, PublicMenu, PublicMenuItem } from "@/lib/api";
import { formatRestaurantLocalInput, parseRestaurantLocalDateTime, restaurantTimeZone } from "@/lib/restaurant-time";

type PickupAttempt = { email: string; key: string; body: PickupRequestBody };
const cartStorageKey = "wok.pickup.cart.v1";
const attemptStorageKey = "wok.pickup.pending.v1";

function formatPrice(item: PublicMenuItem) {
  return new Intl.NumberFormat("es-GT", { style: "currency", currency: item.currency }).format(item.price);
}

function createIdempotencyKey() {
  return Crypto.randomUUID();
}

function validCart(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([id, quantity]) =>
    /^[0-9a-f-]{36}$/i.test(id) && Number.isInteger(quantity) && Number(quantity) > 0 && Number(quantity) <= 50,
  )) as Record<string, number>;
}

export default function MenuScreen() {
  const { session, request } = useSession();
  const [menu, setMenu] = useState<PublicMenu | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartRestored, setCartRestored] = useState(Platform.OS === "web");
  const [requestedFor, setRequestedFor] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [paymentPreference, setPaymentPreference] = useState<PickupRequestBody["paymentPreference"]>("CASH_AT_PICKUP");
  const [invoiceRequested, setInvoiceRequested] = useState(false);
  const [invoiceName, setInvoiceName] = useState("");
  const [invoiceTaxId, setInvoiceTaxId] = useState("");
  const [defaultTaxProfileLabel, setDefaultTaxProfileLabel] = useState("");
  const [attempt, setAttempt] = useState<PickupAttempt | null>(null);
  const [sending, setSending] = useState(false);
  const [receipt, setReceipt] = useState<PickupRequestReceipt | null>(null);
  const taxProfileOwner = useRef("");

  const loadMenu = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setMenu(await apiRequest<PublicMenu>("/api/v1/public/menu")); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : "No pudimos cargar el menú."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let mounted = true;
    apiRequest<PublicMenu>("/api/v1/public/menu")
      .then((result) => { if (mounted) setMenu(result); })
      .catch((cause: unknown) => { if (mounted) setError(cause instanceof ApiError ? cause.message : "No pudimos cargar el menú."); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const accountEmail = session?.email ?? "";
    if (taxProfileOwner.current !== accountEmail) {
      taxProfileOwner.current = accountEmail;
      setInvoiceName(""); setInvoiceTaxId(""); setDefaultTaxProfileLabel("");
    }
    if (!session) return () => { active = false; };
    void request<CustomerTaxProfile[]>("/api/v1/client/tax-profiles")
      .then((profiles) => {
        if (!active) return;
        const preferred = profiles.find((profile) => profile.isDefault);
        if (preferred) {
          setDefaultTaxProfileLabel(preferred.label);
          setInvoiceName((current) => current || preferred.customerName);
          setInvoiceTaxId((current) => current || preferred.customerTaxId);
        }
      })
      .catch(() => { /* Customers can still enter billing details manually. */ });
    return () => { active = false; };
  }, [request, session]);

  useEffect(() => {
    let mounted = true;
    if (Platform.OS === "web") return;
    Promise.all([SecureStore.getItemAsync(cartStorageKey), SecureStore.getItemAsync(attemptStorageKey)])
      .then(([storedCart, storedAttempt]) => {
        if (!mounted) return;
        if (storedCart) {
          try { setCart(validCart(JSON.parse(storedCart) as unknown)); }
          catch { void SecureStore.deleteItemAsync(cartStorageKey); }
        }
        if (storedAttempt) {
          try {
            const value = JSON.parse(storedAttempt) as PickupAttempt;
            if (value.email && value.key && value.body?.items?.length) setAttempt(value);
            else void SecureStore.deleteItemAsync(attemptStorageKey);
          } catch { void SecureStore.deleteItemAsync(attemptStorageKey); }
        }
      })
      .finally(() => { if (mounted) setCartRestored(true); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!cartRestored || Platform.OS === "web") return;
    void SecureStore.setItemAsync(cartStorageKey, JSON.stringify(cart));
  }, [cart, cartRestored]);

  const products = useMemo(() => (menu?.categories ?? []).flatMap((category) => category.items), [menu]);
  const cartItems = products.filter((item) => (cart[item.id] ?? 0) > 0);
  const cartCount = cartItems.reduce((total, item) => total + cart[item.id], 0);
  const cartSubtotal = cartItems.reduce((total, item) => total + item.price * cart[item.id], 0);
  const hasItems = (menu?.categories ?? []).some((category) => category.items.length > 0);
  const activePaymentPreference = attempt?.body.paymentPreference ?? paymentPreference;
  const activeInvoiceRequest = attempt?.body.invoiceRequested ?? invoiceRequested;

  function changeQuantity(item: PublicMenuItem, delta: number) {
    setReceipt(null);
    setCart((current) => {
      const next = { ...current };
      const quantity = (next[item.id] ?? 0) + delta;
      if (quantity <= 0) delete next[item.id];
      else if (quantity <= 50) next[item.id] = quantity;
      return next;
    });
  }

  function suggestPickupTime() {
    const preparationSeconds = cartItems.reduce((total, item) => total + item.estimatedPreparationSeconds * cart[item.id], 0);
    const leadSeconds = Math.max(15 * 60, preparationSeconds + 60);
    const serverTime = Date.parse(menu?.asOf ?? "");
    if (!Number.isNaN(serverTime)) setRequestedFor(formatRestaurantLocalInput(new Date(serverTime + leadSeconds * 1000).toISOString()));
  }

  async function submitPickup() {
    if (!session) { setError("Inicia sesión para enviar una solicitud de pickup."); return; }
    if (attempt && attempt.email !== session.email) {
      setError(`Hay una solicitud anterior sin confirmar para ${attempt.email}. Inicia esa cuenta para reintentarla antes de enviar otra.`);
      return;
    }
    const requestedPickupInstant = attempt ? null : parseRestaurantLocalDateTime(requestedFor);
    if (!attempt && !requestedPickupInstant) { setError("Ingresa una fecha y hora válidas, usando la hora de Guatemala."); return; }
    const activeAttempt = attempt ?? {
      email: session.email,
      key: createIdempotencyKey(),
      body: {
        requestedFor: requestedPickupInstant!.toISOString(),
        customerNote: customerNote.trim() || undefined,
        paymentPreference,
        invoiceRequested,
        invoiceName: invoiceRequested ? invoiceName.trim() : undefined,
        invoiceTaxId: invoiceRequested ? invoiceTaxId.trim() : undefined,
        items: cartItems.map((item) => ({ menuItemId: item.id, quantity: cart[item.id] })),
      },
    };
    if (!activeAttempt.body.items.length) { setError("Agrega al menos un producto."); return; }
    if (activeAttempt.body.invoiceRequested && (!activeAttempt.body.invoiceName?.trim() || !activeAttempt.body.invoiceTaxId?.trim())) {
      setError("Completa el nombre o razón social y el NIT para solicitar factura."); return;
    }
    if (Number.isNaN(Date.parse(activeAttempt.body.requestedFor))) { setError("Revisa la fecha y hora solicitadas."); return; }
    setError(null);
    setSending(true);
    try {
      if (Platform.OS !== "web") await SecureStore.setItemAsync(attemptStorageKey, JSON.stringify(activeAttempt));
      const result = await request<PickupRequestReceipt>("/api/v1/client/order-requests", {
        method: "POST",
        headers: { "Idempotency-Key": activeAttempt.key },
        body: JSON.stringify(activeAttempt.body),
      });
      if (Platform.OS !== "web") {
        await Promise.all([SecureStore.deleteItemAsync(attemptStorageKey), SecureStore.deleteItemAsync(cartStorageKey)]);
      }
      setAttempt(null);
      setReceipt(result);
      setCart({});
      setCustomerNote("");
    } catch (cause) {
      setAttempt(activeAttempt);
      setError(cause instanceof ApiError ? cause.message : "No pudimos confirmar el resultado. Reintenta la misma solicitud.");
    } finally { setSending(false); }
  }

  return <ScrollView contentContainerStyle={{ flexGrow: 1 }}><Page>
    <Heading eyebrow="Catálogo">Menú WOK</Heading>
    {attempt ? <Card>
      <Notice>Solicitud sin confirmar para {attempt.email}. Reintenta esta misma solicitud antes de editarla o enviar otra.</Notice>
      {session?.email === attempt.email ? <Button title="Reintentar solicitud pendiente" onPress={() => void submitPickup()} busy={sending} />
        : <View style={ui.section}><Text style={ui.body}>Inicia sesión con esa cuenta para consultar el mismo resultado de forma segura.</Text><Link href="/account" style={ui.link}>Ir a Mi cuenta</Link></View>}
    </Card> : null}
    {loading ? <Card><Text style={ui.body}>Cargando el menú oficial…</Text></Card> : null}
    {error ? <View style={ui.section}><Notice tone="error">{error}</Notice>{!hasItems ? <Button title="Reintentar menú" secondary onPress={() => void loadMenu()} /> : null}</View> : null}
    {receipt ? <Notice tone="success">Solicitud {receipt.requestId.slice(0, 8)} recibida. Estado: pendiente de revisión. Preferencia: {pickupPaymentLabel(receipt.paymentPreference)}. Aún no es pedido aceptado ni se ha cobrado.{receipt.invoiceRequested ? " Los datos de factura quedaron solicitados; todavía no se emitió FEL." : ""}</Notice> : null}
    {!loading && !error && !hasItems ? <>
      <Card><Text style={{ fontWeight: "800", color: palette.ink, fontSize: 18 }}>El menú se publicará aquí</Text>
        <Text style={ui.body}>Aún no hay platillos publicados. Los productos y precios aparecerán cuando el restaurante cargue su catálogo oficial.</Text>
      </Card>
      <Notice>No mostramos datos de ejemplo como si fueran productos reales.</Notice>
    </> : null}
    {!loading && !error && hasItems ? (menu?.categories ?? []).filter((category) => category.items.length > 0).map((category) =>
      <View key={category.id} style={ui.section}>
        <Text accessibilityRole="header" style={{ color: palette.ink, fontSize: 20, fontWeight: "800" }}>{category.name}</Text>
        {category.items.map((item) => <Card key={item.id}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <Text style={{ flex: 1, color: palette.ink, fontSize: 17, fontWeight: "800" }}>{item.name}</Text>
            <Text style={{ color: palette.red, fontWeight: "800" }}>{formatPrice(item)}</Text>
          </View>
          {item.description ? <Text style={ui.body}>{item.description}</Text> : null}
          <View style={ui.row}>
            <Button title="−" secondary disabled={!cart[item.id]} onPress={() => changeQuantity(item, -1)} />
            <Text accessibilityLiveRegion="polite" style={{ color: palette.ink, fontWeight: "800" }}>{cart[item.id] ?? 0}</Text>
            <Button title="Agregar" onPress={() => changeQuantity(item, 1)} disabled={Boolean(attempt)} />
          </View>
        </Card>)}
      </View>,
    ) : null}
    {hasItems && cartCount > 0 ? <View style={ui.section}>
      <Heading eyebrow="Solicitud">Pickup · {cartCount} productos</Heading>
      <Card>
        {cartItems.map((item) => <View key={item.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
          <Text style={{ flex: 1, color: palette.ink }}>{cart[item.id]} × {item.name}</Text>
          <Text style={{ color: palette.ink, fontWeight: "700" }}>{formatPrice({ ...item, price: item.price * cart[item.id] })}</Text>
        </View>)}
        <Text style={{ color: palette.ink, fontWeight: "800" }}>Subtotal actual: {new Intl.NumberFormat("es-GT", { style: "currency", currency: cartItems[0].currency }).format(cartSubtotal)}</Text>
        <Text style={ui.body}>El backend vuelve a validar precios. El carrito no reserva inventario ni confirma un pedido.</Text>
        <Button title="Sugerir primera hora" secondary onPress={suggestPickupTime} disabled={Boolean(attempt)} />
        <Field label={`Fecha y hora solicitadas (hora de ${restaurantTimeZone})`} value={requestedFor} onChangeText={setRequestedFor} placeholder="AAAA-MM-DDTHH:mm" editable={!attempt} />
        <Field label="Comentarios (opcional)" value={attempt?.body.customerNote ?? customerNote} onChangeText={setCustomerNote} placeholder="Indicaciones para el equipo" editable={!attempt} maxLength={500} />
        <View style={ui.section}>
          <Text style={{ color: palette.ink, fontWeight: "800" }}>Preferencia de pago al recoger</Text>
          <Button title="Efectivo al recoger" secondary={activePaymentPreference !== "CASH_AT_PICKUP"} disabled={Boolean(attempt)} onPress={() => setPaymentPreference("CASH_AT_PICKUP")} />
          <Button title="Tarjeta al recoger" secondary={activePaymentPreference !== "CARD_AT_PICKUP"} disabled={Boolean(attempt)} onPress={() => setPaymentPreference("CARD_AT_PICKUP")} />
          <Button title="Transferencia al recoger" secondary={activePaymentPreference !== "TRANSFER_AT_PICKUP"} disabled={Boolean(attempt)} onPress={() => setPaymentPreference("TRANSFER_AT_PICKUP")} />
          <Notice>Es una preferencia para el equipo. La app no procesa el pago en este paso.</Notice>
        </View>
        <Button title={activeInvoiceRequest ? "Quitar solicitud de factura" : "Solicitar factura"} secondary={!activeInvoiceRequest} disabled={Boolean(attempt)} onPress={() => setInvoiceRequested((current) => !current)} />
        {activeInvoiceRequest ? <View style={ui.section}>
          <Field label="Nombre o razón social" value={attempt?.body.invoiceName ?? invoiceName} onChangeText={setInvoiceName} maxLength={150} editable={!attempt} />
          <Field label="NIT" value={attempt?.body.invoiceTaxId ?? invoiceTaxId} onChangeText={setInvoiceTaxId} maxLength={32} editable={!attempt} placeholder="CF o NIT" />
          {defaultTaxProfileLabel ? <Text style={ui.body}>Datos precargados desde tu perfil «{defaultTaxProfileLabel}». Puedes editarlos para esta solicitud.</Text> : <Link href="/tax-profiles" style={ui.link}>Administrar perfiles fiscales</Link>}
          <Notice>Guardaremos estos datos como solicitud. La factura FEL requiere revisión y emisión posterior.</Notice>
        </View> : null}
        {!session ? <View style={ui.section}><Notice>Para enviar tu solicitud, primero inicia sesión.</Notice><Link href="/account" style={ui.link}>Ir a Mi cuenta</Link></View> : null}
        {session?.offline ? <Notice>Estás sin conexión. La solicitud requiere confirmación del servidor y no se enviará automáticamente.</Notice> : null}
        {attempt ? <Notice>Hay un envío cuyo resultado no se confirmó. Reintenta exactamente la misma solicitud; la app conserva su clave para evitar duplicados.</Notice> : null}
        <Button title={attempt ? "Reintentar solicitud pendiente" : "Enviar solicitud de pickup"}
          onPress={() => void submitPickup()} busy={sending} disabled={!session || (session.offline && !process.env.EXPO_PUBLIC_API_BASE_URL)} />
      </Card>
    </View> : null}
  </Page></ScrollView>;
}

function pickupPaymentLabel(value: PickupRequestBody["paymentPreference"] | null) {
  if (value === "CARD_AT_PICKUP") return "tarjeta al recoger";
  if (value === "TRANSFER_AT_PICKUP") return "transferencia al recoger";
  return "efectivo al recoger";
}
