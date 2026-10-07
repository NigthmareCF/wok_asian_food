import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { Link } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { Button, Card, Field, Heading, Notice, Page, palette, ui } from "@/components/ui";
import { useSession } from "@/providers/session-provider";
import { ApiError, apiRequest, CustomerTaxProfile, MenuAvailabilityEstimate, PickupRequestBody, PickupRequestReceipt, PublicMenu, PublicMenuItem } from "@/lib/api";
import { MenuItemOptions } from "@/components/menu-item-options";
import { ServiceHoursNotice } from "@/components/service-hours-notice";
import { menuItemUnitPrice, menuModifiersAreValid } from "@/lib/menu-options";
import { formatRestaurantLocalInput, parseRestaurantLocalDateTime, restaurantTimeZone } from "@/lib/restaurant-time";
import { CommerceStorageKeys, resolveCommerceStorageKeys } from "@/lib/commerce-storage";
import { PublicServiceCapability, requestServiceState } from "@/lib/reservation-service-status";
import { useFocusedPolling } from "@/lib/use-focused-polling";
import { serviceSlotStatus } from "@/lib/service-hours";
import { useServiceHours } from "@/lib/use-service-hours";
import { isValidPositiveApiInteger } from "@/lib/quantity-limits";
import { canAddDistinctMenuLine, MAX_DISTINCT_MENU_LINES } from "@/lib/request-limits";

type PickupAttempt = { email: string; key: string; body: PickupRequestBody };
const legacyStorageKeys = { cart: "wok.pickup.cart.v1", modifiers: "wok.pickup.modifiers.v1", pending: "wok.pickup.pending.v1" };

function formatPrice(item: PublicMenuItem) {
  return new Intl.NumberFormat("es-GT", { style: "currency", currency: item.currency }).format(item.price);
}

function createIdempotencyKey() {
  return Crypto.randomUUID();
}

function validCart(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([id, quantity]) =>
    /^[0-9a-f-]{36}$/i.test(id) && isValidPositiveApiInteger(quantity),
  )) as Record<string, number>;
}

export default function MenuScreen() {
  const { session, request } = useSession();
  return <PickupMenu key={session?.email ?? "anonymous"} session={session} request={request} />;
}

function PickupMenu({ session, request }: Pick<ReturnType<typeof useSession>, "session" | "request">) {
  const [menu, setMenu] = useState<PublicMenu | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, string[]>>({});
  const [cartRestored, setCartRestored] = useState(Platform.OS === "web");
  const [cartStorageKeys, setCartStorageKeys] = useState<CommerceStorageKeys | null>(null);
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
  const [availability, setAvailability] = useState<MenuAvailabilityEstimate | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [serviceCapabilities, setServiceCapabilities] = useState<PublicServiceCapability[] | null>(null);
  const [serviceStatusError, setServiceStatusError] = useState("");
  const [serviceStatusLoading, setServiceStatusLoading] = useState(true);
  const availabilityRevision = useRef(0);
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

  const refreshServiceCapabilities = useCallback(async () => {
    setServiceStatusLoading(true);
    try {
      setServiceCapabilities(await apiRequest<PublicServiceCapability[]>("/api/v1/public/service-capabilities"));
      setServiceStatusError("");
    } catch (cause) {
      setServiceStatusError(cause instanceof ApiError ? cause.message : "No pudimos consultar el estado de pickup.");
    } finally { setServiceStatusLoading(false); }
  }, []);

  useEffect(() => { void Promise.resolve().then(refreshServiceCapabilities); }, [refreshServiceCapabilities]);
  useFocusedPolling(refreshServiceCapabilities, 60_000, true);

  const pickupService = requestServiceState(serviceCapabilities, "PICKUP");
  const publishedHours = useServiceHours("PICKUP", requestedFor);

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
    const accountEmail = session?.email ?? null;
    void resolveCommerceStorageKeys("pickup", accountEmail).then(async (keys) => {
      if (!mounted) return;
      setCartStorageKeys(keys);
      const [storedCart, storedModifiers, scopedAttempt, legacyAttempt] = await Promise.all([
        SecureStore.getItemAsync(keys.cart), SecureStore.getItemAsync(keys.modifiers),
        SecureStore.getItemAsync(keys.pending), SecureStore.getItemAsync(legacyStorageKeys.pending),
      ]);
      await Promise.all([SecureStore.deleteItemAsync(legacyStorageKeys.cart), SecureStore.deleteItemAsync(legacyStorageKeys.modifiers)]);
      let storedAttempt = scopedAttempt;
      if (!storedAttempt && legacyAttempt) {
        try {
          const old = JSON.parse(legacyAttempt) as PickupAttempt;
          if (accountEmail && old.email?.trim().toLowerCase() === accountEmail.trim().toLowerCase()) {
            storedAttempt = legacyAttempt;
            await SecureStore.setItemAsync(keys.pending, legacyAttempt);
            await SecureStore.deleteItemAsync(legacyStorageKeys.pending);
          }
        } catch { /* Keep an unowned legacy attempt isolated until its account signs in. */ }
      }
      if (mounted) {
        if (storedCart) {
          try { setCart(validCart(JSON.parse(storedCart) as unknown)); }
          catch { void SecureStore.deleteItemAsync(keys.cart); }
        }
        if (storedModifiers) {
          try { setSelectedModifiers(validModifierSelections(JSON.parse(storedModifiers) as unknown)); }
          catch { void SecureStore.deleteItemAsync(keys.modifiers); }
        }
        if (storedAttempt) {
          try {
            const value = JSON.parse(storedAttempt) as PickupAttempt;
            if (value.email && value.key && value.body?.items?.length) setAttempt(value);
            else void SecureStore.deleteItemAsync(keys.pending);
          } catch { void SecureStore.deleteItemAsync(keys.pending); }
        }
      }
    }).catch((cause: unknown) => {
      if (mounted) setError(cause instanceof Error ? cause.message : "No se pudo recuperar el carrito de esta cuenta.");
    })
      .finally(() => { if (mounted) setCartRestored(true); });
    return () => { mounted = false; };
  }, [session?.email]);

  useEffect(() => {
    if (!cartRestored || Platform.OS === "web" || !cartStorageKeys) return;
    void SecureStore.setItemAsync(cartStorageKeys.cart, JSON.stringify(cart));
  }, [cart, cartRestored, cartStorageKeys]);

  useEffect(() => {
    if (!cartRestored || Platform.OS === "web" || !cartStorageKeys) return;
    void SecureStore.setItemAsync(cartStorageKeys.modifiers, JSON.stringify(selectedModifiers));
  }, [selectedModifiers, cartRestored, cartStorageKeys]);

  const products = useMemo(() => (menu?.categories ?? []).flatMap((category) => category.items), [menu]);
  const cartItems = products.filter((item) => (cart[item.id] ?? 0) > 0);
  const cartCount = cartItems.reduce((total, item) => total + cart[item.id], 0);
  const cartSubtotal = cartItems.reduce((total, item) => total + menuItemUnitPrice(item, selectedModifiers[item.id]) * cart[item.id], 0);
  const cartSelectionsValid = cartItems.every((item) => menuModifiersAreValid(item.modifierGroups, selectedModifiers[item.id]));
  const hasItems = (menu?.categories ?? []).some((category) => category.items.length > 0);
  const activePaymentPreference = attempt?.body.paymentPreference ?? paymentPreference;
  const activeInvoiceRequest = attempt?.body.invoiceRequested ?? invoiceRequested;

  function changeQuantity(item: PublicMenuItem, delta: number) {
    if (delta > 0 && !canAddDistinctMenuLine(cart, item.id)) {
      setError(`Puedes agregar hasta ${MAX_DISTINCT_MENU_LINES} productos distintos por solicitud.`);
      return;
    }
    setError(null);
    availabilityRevision.current += 1; setAvailability(null); setAvailabilityLoading(false); setAvailabilityError("");
    setReceipt(null);
    const quantity = (cart[item.id] ?? 0) + delta;
    if (quantity <= 0) {
      const next = { ...cart }; delete next[item.id]; setCart(next);
      setSelectedModifiers((current) => { const selected = { ...current }; delete selected[item.id]; return selected; });
    } else if (isValidPositiveApiInteger(quantity)) setCart({ ...cart, [item.id]: quantity });
  }

  function changeModifiers(item: PublicMenuItem, ids: string[]) {
    availabilityRevision.current += 1; setAvailability(null); setAvailabilityLoading(false); setAvailabilityError("");
    setReceipt(null);
    setSelectedModifiers((current) => ({ ...current, [item.id]: ids }));
  }

  async function checkAvailability() {
    if (!cartSelectionsValid || cartItems.length === 0) return;
    const revision = ++availabilityRevision.current;
    setAvailability(null); setAvailabilityError(""); setAvailabilityLoading(true);
    try {
      const estimate = await apiRequest<MenuAvailabilityEstimate>("/api/v1/public/menu/availability", {
        method: "POST",
        body: JSON.stringify({ items: cartItems.map((item) => ({ menuItemId: item.id, quantity: cart[item.id],
          modifierIds: [...(selectedModifiers[item.id] ?? [])].sort() })) }),
      });
      if (revision === availabilityRevision.current) setAvailability(estimate);
    } catch (cause) {
      if (revision === availabilityRevision.current) setAvailabilityError(cause instanceof ApiError ? cause.message : "No pudimos estimar la disponibilidad ahora.");
    } finally { if (revision === availabilityRevision.current) setAvailabilityLoading(false); }
  }

  function suggestPickupTime() {
    const preparationSeconds = cartItems.reduce((total, item) => total + item.estimatedPreparationSeconds * cart[item.id], 0);
    const leadSeconds = Math.max(15 * 60, preparationSeconds + 60);
    const serverTime = Date.parse(menu?.asOf ?? "");
    if (!Number.isNaN(serverTime)) setRequestedFor(formatRestaurantLocalInput(new Date(serverTime + leadSeconds * 1000).toISOString()));
  }

  async function submitPickup() {
    if (pickupService === "paused" && !attempt) { setError("El servicio de pickup está pausado temporalmente."); return; }
    if (!session) { setError("Inicia sesión para enviar una solicitud de pickup."); return; }
    if (Platform.OS !== "web" && !cartStorageKeys) { setError("Estamos preparando el carrito seguro de esta cuenta. Inténtalo de nuevo."); return; }
    if (attempt && attempt.email !== session.email) {
      setError(`Hay una solicitud anterior sin confirmar para ${attempt.email}. Inicia esa cuenta para reintentarla antes de enviar otra.`);
      return;
    }
    const requestedPickupInstant = attempt ? null : parseRestaurantLocalDateTime(requestedFor);
    if (!attempt && !requestedPickupInstant) { setError("Ingresa una fecha y hora válidas, usando la hora de Guatemala."); return; }
    const slotStatus = serviceSlotStatus(publishedHours.day, requestedFor);
    if (!attempt && (slotStatus === "closed" || slotStatus === "outside-hours")) {
      setError(slotStatus === "closed" ? "El servicio de pickup no opera en esa fecha." : "La hora elegida está fuera del horario publicado de pickup.");
      return;
    }
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
        items: cartItems.map((item) => ({ menuItemId: item.id, quantity: cart[item.id],
          modifierIds: [...(selectedModifiers[item.id] ?? [])].sort() })),
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
      if (Platform.OS !== "web" && cartStorageKeys) await SecureStore.setItemAsync(cartStorageKeys.pending, JSON.stringify(activeAttempt));
      const result = await request<PickupRequestReceipt>("/api/v1/client/order-requests", {
        method: "POST",
        headers: { "Idempotency-Key": activeAttempt.key },
        body: JSON.stringify(activeAttempt.body),
      });
      if (Platform.OS !== "web") {
        if (cartStorageKeys) await Promise.all([SecureStore.deleteItemAsync(cartStorageKeys.pending),
          SecureStore.deleteItemAsync(cartStorageKeys.cart), SecureStore.deleteItemAsync(cartStorageKeys.modifiers)]);
      }
      setAttempt(null);
      setReceipt(result);
      setCart({});
      setSelectedModifiers({});
      setCustomerNote("");
    } catch (cause) {
      setAttempt(activeAttempt);
      setError(cause instanceof ApiError ? cause.message : "No pudimos confirmar el resultado. Reintenta la misma solicitud.");
    } finally { setSending(false); }
  }

  return <ScrollView contentContainerStyle={{ flexGrow: 1 }}><Page>
    <Heading eyebrow="Catálogo">Menú WOK</Heading>
    {pickupService === "paused" ? <Notice>Las solicitudes pickup están pausadas temporalmente. Puedes conservar el carrito y volver a intentarlo cuando el servicio esté disponible.</Notice> : null}
    {pickupService === "manual-approval" ? <Notice>El equipo revisará y confirmará cada solicitud de pickup antes de aceptarla.</Notice> : null}
    {pickupService === "unknown" ? <Notice tone={serviceStatusError ? "error" : "info"}>{serviceStatusError || (serviceStatusLoading ? "Consultando el estado de pickup…" : "El restaurante no publicó el estado de pickup.")}</Notice> : null}
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
          {item.ageRestricted ? <Notice>Producto +18 · consulta al personal sobre disponibilidad y requisitos.</Notice> : null}
          {item.description ? <Text style={ui.body}>{item.description}</Text> : null}
          <MenuItemOptions item={item} selectedIds={selectedModifiers[item.id] ?? []}
            onChange={(ids) => changeModifiers(item, ids)} disabled={Boolean(attempt)} />
          <View style={ui.row}>
            <Button title="−" secondary disabled={!cart[item.id]} onPress={() => changeQuantity(item, -1)} />
            <Text accessibilityLiveRegion="polite" style={{ color: palette.ink, fontWeight: "800" }}>{cart[item.id] ?? 0}</Text>
            <Button title="Agregar" onPress={() => changeQuantity(item, 1)}
              disabled={Boolean(attempt) || !menuModifiersAreValid(item.modifierGroups, selectedModifiers[item.id])} />
          </View>
        </Card>)}
      </View>,
    ) : null}
    {hasItems && cartCount > 0 ? <View style={ui.section}>
      <Heading eyebrow="Solicitud">Pickup · {cartCount} productos</Heading>
      <Card>
        {cartItems.map((item) => <View key={item.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
          <Text style={{ flex: 1, color: palette.ink }}>{cart[item.id]} × {item.name}
            {selectedModifierNames(item, selectedModifiers[item.id]).length ? ` · ${selectedModifierNames(item, selectedModifiers[item.id]).join(", ")}` : ""}</Text>
          <Text style={{ color: palette.ink, fontWeight: "700" }}>{new Intl.NumberFormat("es-GT", { style: "currency", currency: item.currency }).format(menuItemUnitPrice(item, selectedModifiers[item.id]) * cart[item.id])}</Text>
        </View>)}
        <Text style={{ color: palette.ink, fontWeight: "800" }}>Subtotal actual: {new Intl.NumberFormat("es-GT", { style: "currency", currency: cartItems[0].currency }).format(cartSubtotal)}</Text>
        <Text style={ui.body}>El backend vuelve a validar precios. El carrito no reserva inventario ni confirma un pedido.</Text>
        <Button title="Revisar disponibilidad estimada" secondary busy={availabilityLoading}
          disabled={!cartSelectionsValid || availabilityLoading || Boolean(attempt)} onPress={() => void checkAvailability()} />
        {availabilityError ? <Notice tone="error">{availabilityError}</Notice> : null}
        {availability ? <AvailabilityNotice estimate={availability} products={cartItems} /> : null}
        <Button title="Sugerir primera hora" secondary onPress={suggestPickupTime} disabled={Boolean(attempt)} />
        <Field label={`Fecha y hora solicitadas (hora de ${restaurantTimeZone})`} value={requestedFor} onChangeText={setRequestedFor} placeholder="AAAA-MM-DDTHH:mm" editable={!attempt} />
        <ServiceHoursNotice serviceName="pickup" localDateTime={requestedFor} day={publishedHours.day}
          loading={publishedHours.loading} error={publishedHours.error} />
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
        {!cartSelectionsValid ? <Notice tone="error">Completa las opciones requeridas para cada platillo antes de enviar.</Notice> : null}
        <Button title={attempt ? "Reintentar solicitud pendiente" : "Enviar solicitud de pickup"}
          onPress={() => void submitPickup()} busy={sending} disabled={(pickupService === "paused" && !attempt) || !session || !cartRestored || !cartSelectionsValid || (session.offline && !process.env.EXPO_PUBLIC_API_BASE_URL)} />
      </Card>
    </View> : null}
  </Page></ScrollView>;
}

function validModifierSelections(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([itemId, ids]) =>
    /^[0-9a-f-]{36}$/i.test(itemId) && Array.isArray(ids) && ids.length <= 30
      && ids.every((id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)),
  ).map(([itemId, ids]) => [itemId, [...new Set(ids as string[])]]));
}

function AvailabilityNotice({ estimate, products }: { estimate: MenuAvailabilityEstimate; products: PublicMenuItem[] }) {
  const productById = new Map(products.map((item) => [item.id, item.name]));
  const summary = estimate.availableEstimate === true
    ? "El inventario registrado alcanza para todos los productos en esta revisión."
    : estimate.availableEstimate === false
      ? "El inventario registrado no alcanza para uno o más productos."
      : "No hay datos suficientes de receta o inventario para estimar este carrito.";
  const lines = estimate.items.map((item) => `${productById.get(item.menuItemId) ?? "Producto"}: ${availabilityLabel(item.status)}`).join(" ");
  return <Notice tone={estimate.availableEstimate === false ? "error" : estimate.availableEstimate === true ? "success" : undefined}>
    {summary} {lines} Es sólo una estimación; no aparta existencias y el restaurante volverá a validar al revisar la solicitud.
  </Notice>;
}

function availabilityLabel(status: MenuAvailabilityEstimate["items"][number]["status"]) {
  if (status === "AVAILABLE_ESTIMATE") return "estimado disponible.";
  if (status === "UNAVAILABLE_ESTIMATE") return "estimado sin existencias suficientes.";
  return "sin seguimiento de inventario.";
}

function selectedModifierNames(item: PublicMenuItem, selectedIds: string[] = []) {
  return (item.modifierGroups ?? []).flatMap((group) => group.options
    .filter((option) => selectedIds.includes(option.id)).map((option) => option.name));
}

function pickupPaymentLabel(value: PickupRequestBody["paymentPreference"] | null) {
  if (value === "CARD_AT_PICKUP") return "tarjeta al recoger";
  if (value === "TRANSFER_AT_PICKUP") return "transferencia al recoger";
  return "efectivo al recoger";
}
