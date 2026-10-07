import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { Link } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Button, Card, Field, Heading, Notice, Page, palette, ui } from "@/components/ui";
import { ApiError, apiRequest, CustomerAddress, CustomerTaxProfile, DeliveryRequestBody, DeliveryRequestDetails, DeliveryRequestReceipt, MenuAvailabilityEstimate, OrderQuoteReceipt, PublicMenu, PublicMenuItem } from "@/lib/api";
import { formatRestaurantDateTime, formatRestaurantLocalInput, parseRestaurantLocalDateTime, restaurantTimeZone } from "@/lib/restaurant-time";
import { useSession } from "@/providers/session-provider";
import { formatGuatemalaPhone, isValidGuatemalaPhone } from "@/lib/guatemala-phone";
import { MenuItemOptions } from "@/components/menu-item-options";
import { ServiceHoursNotice } from "@/components/service-hours-notice";
import { menuItemUnitPrice, menuModifiersAreValid } from "@/lib/menu-options";
import { CommerceStorageKeys, resolveCommerceStorageKeys } from "@/lib/commerce-storage";
import { PublicServiceCapability, requestServiceState } from "@/lib/reservation-service-status";
import { useFocusedPolling } from "@/lib/use-focused-polling";
import { serviceSlotStatus } from "@/lib/service-hours";
import { useServiceHours } from "@/lib/use-service-hours";
import { isValidPositiveApiInteger, MAX_API_INTEGER } from "@/lib/quantity-limits";
import { canAddDistinctMenuLine, MAX_DISTINCT_MENU_LINES } from "@/lib/request-limits";

type PendingAttempt = { email: string; key: string; body: DeliveryRequestBody; phase?: "QUOTE" | "ORDER"; quoteId?: string };
const legacyStorageKeys = { cart: "wok.delivery.cart.v1", modifiers: "wok.delivery.modifiers.v1", pending: "wok.delivery.pending.v1" };

export default function DeliveryScreen() {
  const { session, request } = useSession();
  return <DeliveryRequestScreen key={session?.email ?? "guest"} session={session} request={request} />;
}

type DeliveryRequestProps = Pick<ReturnType<typeof useSession>, "session" | "request">;

function DeliveryRequestScreen({ session, request }: DeliveryRequestProps) {
  const [menu, setMenu] = useState<PublicMenu | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, string[]>>({});
  const [cartRestored, setCartRestored] = useState(false);
  const [cartStorageKeys, setCartStorageKeys] = useState<CommerceStorageKeys | null>(null);
  const [requestedFor, setRequestedFor] = useState("");
  const [address, setAddress] = useState("");
  const [reference, setReference] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [addressLabel, setAddressLabel] = useState("Casa");
  const [saveAsDefault, setSaveAsDefault] = useState(true);
  const [selectedAddress, setSelectedAddress] = useState<CustomerAddress | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<CustomerAddress[]>([]);
  const [addressOwner, setAddressOwner] = useState("");
  const [savingAddress, setSavingAddress] = useState(false);
  const [addressError, setAddressError] = useState("");
  const [addressNotice, setAddressNotice] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [paymentPreference, setPaymentPreference] = useState<DeliveryRequestBody["paymentPreference"]>("CASH_ON_DELIVERY");
  const [invoiceRequested, setInvoiceRequested] = useState(false);
  const [invoiceName, setInvoiceName] = useState("");
  const [invoiceTaxId, setInvoiceTaxId] = useState("");
  const [defaultTaxProfileLabel, setDefaultTaxProfileLabel] = useState("");
  const [pending, setPending] = useState<PendingAttempt | null>(null);
  const [quoteDraft, setQuoteDraft] = useState<PendingAttempt | null>(null);
  const [quote, setQuote] = useState<OrderQuoteReceipt | null>(null);
  const [receipt, setReceipt] = useState<DeliveryRequestReceipt | null>(null);
  const [history, setHistory] = useState<DeliveryRequestReceipt[]>([]);
  const [historyOwner, setHistoryOwner] = useState("");
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [details, setDetails] = useState<DeliveryRequestDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [availability, setAvailability] = useState<MenuAvailabilityEstimate | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [serviceCapabilities, setServiceCapabilities] = useState<PublicServiceCapability[] | null>(null);
  const [serviceStatusError, setServiceStatusError] = useState("");
  const [serviceStatusLoading, setServiceStatusLoading] = useState(true);
  const availabilityRevision = useRef(0);

  useEffect(() => {
    let active = true;
    const accountEmail = session?.email ?? null;
    void Promise.allSettled([fetchMenu(), resolveCommerceStorageKeys("delivery", accountEmail)])
      .then(async ([menuResult, keysResult]) => {
        if (!active) return;
        if (menuResult.status === "fulfilled") setMenu(menuResult.value);
        else setError(menuResult.reason instanceof ApiError ? menuResult.reason.message : "No pudimos cargar el menú para delivery.");
        if (keysResult.status === "rejected") throw keysResult.reason;
        const keys = keysResult.value;
        setCartStorageKeys(keys);
        const [cartResult, modifiersResult, scopedAttempt, legacyAttempt] = await Promise.all([
          SecureStore.getItemAsync(keys.cart), SecureStore.getItemAsync(keys.modifiers),
          SecureStore.getItemAsync(keys.pending), SecureStore.getItemAsync(legacyStorageKeys.pending),
        ]);
        await Promise.all([SecureStore.deleteItemAsync(legacyStorageKeys.cart), SecureStore.deleteItemAsync(legacyStorageKeys.modifiers)]);
        if (!active) return;
        if (cartResult) {
          try { setCart(validCart(JSON.parse(cartResult) as unknown)); }
          catch { void SecureStore.deleteItemAsync(keys.cart); }
        }
        if (modifiersResult) {
          try { setSelectedModifiers(validModifierSelections(JSON.parse(modifiersResult) as unknown)); }
          catch { void SecureStore.deleteItemAsync(keys.modifiers); }
        }
        let storedAttempt = scopedAttempt;
        if (!storedAttempt && legacyAttempt) {
          try {
            const parsed = JSON.parse(legacyAttempt) as PendingAttempt;
            if (accountEmail && parsed.email?.trim().toLowerCase() === accountEmail.trim().toLowerCase()) {
              storedAttempt = legacyAttempt;
              await SecureStore.setItemAsync(keys.pending, legacyAttempt);
              await SecureStore.deleteItemAsync(legacyStorageKeys.pending);
            }
          } catch { /* Keep an unowned legacy attempt isolated until its account signs in. */ }
        }
        if (storedAttempt) {
          try {
            const parsed = JSON.parse(storedAttempt) as PendingAttempt;
            if (parsed.email && parsed.key && parsed.body?.items?.length) {
              setRequestedFor(formatRestaurantLocalInput(parsed.body.requestedFor));
              if (parsed.phase === "QUOTE") {
                setQuoteDraft(parsed); setAddress(parsed.body.address); setReference(parsed.body.reference ?? "");
                setContactPhone(formatGuatemalaPhone(parsed.body.contactPhone));
                setCustomerNote(parsed.body.customerNote ?? ""); setPaymentPreference(parsed.body.paymentPreference);
                setInvoiceRequested(parsed.body.invoiceRequested); setInvoiceName(parsed.body.invoiceName ?? "");
                setInvoiceTaxId(parsed.body.invoiceTaxId ?? "");
              }
              else setPending(parsed);
            }
            else void SecureStore.deleteItemAsync(keys.pending);
          } catch { void SecureStore.deleteItemAsync(keys.pending); }
        }
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "No se pudo recuperar el carrito de esta cuenta."); })
      .finally(() => { if (active) { setLoading(false); setCartRestored(true); } });
    return () => { active = false; };
  }, [session?.email]);

  const refreshServiceCapabilities = useCallback(async () => {
    setServiceStatusLoading(true);
    try {
      setServiceCapabilities(await apiRequest<PublicServiceCapability[]>("/api/v1/public/service-capabilities"));
      setServiceStatusError("");
    } catch (cause) {
      setServiceStatusError(cause instanceof ApiError ? cause.message : "No pudimos consultar el estado de delivery.");
    } finally { setServiceStatusLoading(false); }
  }, []);

  useEffect(() => { void Promise.resolve().then(refreshServiceCapabilities); }, [refreshServiceCapabilities]);
  useFocusedPolling(refreshServiceCapabilities, 60_000, true);

  useEffect(() => {
    if (!cartRestored || !cartStorageKeys) return;
    void SecureStore.setItemAsync(cartStorageKeys.cart, JSON.stringify(cart));
  }, [cart, cartRestored, cartStorageKeys]);

  useEffect(() => {
    if (!cartRestored || !cartStorageKeys) return;
    void SecureStore.setItemAsync(cartStorageKeys.modifiers, JSON.stringify(selectedModifiers));
  }, [selectedModifiers, cartRestored, cartStorageKeys]);

  useEffect(() => {
    let active = true;
    if (!session) return () => { active = false; };
    void request<DeliveryRequestReceipt[]>("/api/v1/client/delivery-requests")
      .then((items) => { if (active) { setHistory(items); setHistoryOwner(session.email); setHistoryLoaded(true); setHistoryError(""); } })
      .catch((cause: unknown) => { if (active) { setHistoryError(cause instanceof ApiError ? cause.message : "No pudimos cargar tus solicitudes delivery."); setHistoryLoaded(true); } });
    return () => { active = false; };
  }, [request, session]);

  useEffect(() => {
    let active = true;
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
    let active = true;
    if (!session) return () => { active = false; };
    void request<CustomerAddress[]>("/api/v1/client/addresses")
      .then((items) => {
        if (!active) return;
        setSavedAddresses(items); setAddressOwner(session.email);
        if (items.length) setSaveAsDefault(items.every((item) => !item.isDefault));
      })
      .catch((cause: unknown) => { if (active) setAddressError(cause instanceof ApiError ? cause.message : "No pudimos cargar tus direcciones guardadas."); });
    return () => { active = false; };
  }, [request, session]);

  const products = useMemo(() => (menu?.categories ?? []).flatMap((category) => category.items), [menu]);
  const selected = products.filter((item) => (cart[item.id] ?? 0) > 0);
  const selectionsValid = selected.every((item) => menuModifiersAreValid(item.modifierGroups, selectedModifiers[item.id]));
  const subtotal = selected.reduce((total, item) => total + menuItemUnitPrice(item, selectedModifiers[item.id]) * cart[item.id], 0);
  const visibleHistory = session?.email === historyOwner ? history : [];
  const deliveryService = requestServiceState(serviceCapabilities, "DELIVERY");
  const publishedHours = useServiceHours("DELIVERY", requestedFor);

  function changeQuantity(item: PublicMenuItem, delta: number) {
    if (pending) return;
    clearQuoteDraft();
    if (delta > 0 && !canAddDistinctMenuLine(cart, item.id)) {
      setError(`Puedes agregar hasta ${MAX_DISTINCT_MENU_LINES} productos distintos por solicitud.`);
      return;
    }
    setError("");
    availabilityRevision.current += 1; setAvailability(null); setAvailabilityLoading(false); setAvailabilityError("");
    if ((cart[item.id] ?? 0) + delta < 1) {
      setSelectedModifiers((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    }
    setCart((current) => {
      const next = { ...current };
      const quantity = (next[item.id] ?? 0) + delta;
      if (quantity < 1) delete next[item.id];
      else if (isValidPositiveApiInteger(quantity)) next[item.id] = quantity;
      return next;
    });
  }

  function changeModifiers(item: PublicMenuItem, ids: string[]) {
    if (pending) return;
    clearQuoteDraft();
    availabilityRevision.current += 1; setAvailability(null); setAvailabilityLoading(false); setAvailabilityError("");
    setSelectedModifiers((current) => ({ ...current, [item.id]: ids }));
  }

  function clearQuoteDraft() {
    setQuoteDraft(null); setQuote(null);
    if (cartStorageKeys) void SecureStore.deleteItemAsync(cartStorageKeys.pending);
  }

  async function checkAvailability() {
    if (!selected.length || !selectionsValid) return;
    const revision = ++availabilityRevision.current;
    setAvailability(null); setAvailabilityError(""); setAvailabilityLoading(true);
    try {
      const estimate = await apiRequest<MenuAvailabilityEstimate>("/api/v1/public/menu/availability", {
        method: "POST",
        body: JSON.stringify({ items: selected.map((item) => ({ menuItemId: item.id, quantity: cart[item.id],
          modifierIds: [...(selectedModifiers[item.id] ?? [])].sort() })) }),
      });
      if (revision === availabilityRevision.current) setAvailability(estimate);
    } catch (cause) {
      if (revision === availabilityRevision.current) setAvailabilityError(cause instanceof ApiError ? cause.message : "No pudimos estimar la disponibilidad ahora.");
    } finally { if (revision === availabilityRevision.current) setAvailabilityLoading(false); }
  }

  function suggestTime() {
    clearQuoteDraft();
    const prep = selected.reduce((sum, item) => sum + item.estimatedPreparationSeconds * cart[item.id], 0);
    const apiTime = Date.parse(menu?.asOf ?? "");
    if (!Number.isNaN(apiTime)) setRequestedFor(formatRestaurantLocalInput(new Date(apiTime + Math.max(30 * 60, prep + 60) * 1000).toISOString()));
  }

  async function submit(attempt?: PendingAttempt) {
    const existingAttempt = attempt ?? pending;
    const existingDraft = quoteDraft;
    if (deliveryService === "paused" && !existingAttempt) { setError("El servicio de delivery está pausado temporalmente."); return; }
    if (!session) { setError("Inicia sesión para enviar una solicitud de delivery."); return; }
    if (!cartStorageKeys || !cartRestored) { setError("Estamos preparando el carrito seguro de esta cuenta. Inténtalo de nuevo."); return; }
    if (!existingAttempt && !existingDraft && !selectionsValid) {
      setError("Completa las opciones requeridas para cada platillo antes de enviar."); return;
    }
    if (!existingAttempt && !existingDraft && !isValidGuatemalaPhone(contactPhone)) {
      setError("Ingresa un teléfono de Guatemala válido: 8 dígitos en formato 0000 0000."); return;
    }
    if (!existingAttempt && !existingDraft && (!selected.length || !address.trim() || !contactPhone.trim() || !requestedFor)) {
      setError("Completa productos, dirección, teléfono y horario solicitado."); return;
    }
    let draftAttempt: PendingAttempt;
    try {
      const deliveryInstant = existingAttempt || existingDraft ? null : parseRestaurantLocalDateTime(requestedFor);
      if (!existingAttempt && !existingDraft && !deliveryInstant) throw new Error("Indica una fecha y hora válidas en la hora de Guatemala.");
      const slotStatus = serviceSlotStatus(publishedHours.day, requestedFor);
      if (!existingAttempt && !existingDraft && (slotStatus === "closed" || slotStatus === "outside-hours"))
        throw new Error(slotStatus === "closed" ? "El servicio de delivery no opera en esa fecha." : "La hora elegida está fuera del horario publicado de delivery.");
      draftAttempt = existingAttempt ?? existingDraft ?? {
        email: session.email,
        key: createIdempotencyKey(),
        body: {
          requestedFor: deliveryInstant!.toISOString(), customerNote: customerNote.trim() || undefined,
          address: address.trim(), reference: reference.trim() || undefined, contactPhone: contactPhone.trim(),
          paymentPreference, invoiceRequested,
          invoiceName: invoiceRequested ? invoiceName.trim() : undefined,
          invoiceTaxId: invoiceRequested ? invoiceTaxId.trim() : undefined,
          items: selected.map((item) => ({ menuItemId: item.id, quantity: cart[item.id],
            modifierIds: [...(selectedModifiers[item.id] ?? [])].sort() })),
        },
      };
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo preparar la solicitud."); return;
    }
    if (draftAttempt.body.invoiceRequested && (!draftAttempt.body.invoiceName?.trim() || !draftAttempt.body.invoiceTaxId?.trim())) {
      setError("Completa el nombre o razón social y el NIT para solicitar factura."); return;
    }
    if (draftAttempt.email !== session.email) { setError(`Inicia sesión con ${draftAttempt.email} para reintentar la solicitud protegida.`); return; }
    setSending(true); setError(""); setNotice("");
    let orderAttempt: PendingAttempt | null = existingAttempt;
    try {
      if (!existingAttempt && (!quote || !quote.usable)) {
        const quotingAttempt = { ...draftAttempt, phase: "QUOTE" as const };
        setQuoteDraft(quotingAttempt);
        await SecureStore.setItemAsync(cartStorageKeys.pending, JSON.stringify(quotingAttempt));
        const result = await request<OrderQuoteReceipt>("/api/v1/client/order-quotes", {
          method: "POST", headers: { "Idempotency-Key": quotingAttempt.key },
          body: JSON.stringify({ fulfillmentType: "DELIVERY", requestedFor: quotingAttempt.body.requestedFor,
            items: quotingAttempt.body.items }),
        });
        setQuote(result);
        if (!result.usable) throw new ApiError("La cotización venció. Solicita una nueva antes de enviar.", 409);
        setNotice("Revisa el total y confirma para enviar la solicitud a revisión.");
        return;
      }
      const activeAttempt = existingAttempt ?? {
        ...draftAttempt, phase: "ORDER" as const, quoteId: quote?.quoteId,
        body: { ...draftAttempt.body, customerNote: customerNote.trim() || undefined,
          address: address.trim(), reference: reference.trim() || undefined, contactPhone: contactPhone.trim(),
          paymentPreference, invoiceRequested, invoiceName: invoiceRequested ? invoiceName.trim() : undefined,
          invoiceTaxId: invoiceRequested ? invoiceTaxId.trim() : undefined },
      };
      orderAttempt = activeAttempt;
      await SecureStore.setItemAsync(cartStorageKeys.pending, JSON.stringify(activeAttempt));
      const result = await request<DeliveryRequestReceipt>("/api/v1/client/delivery-requests", {
        method: "POST", headers: { "Idempotency-Key": activeAttempt.key,
          ...(activeAttempt.quoteId ? { "X-Order-Quote-Id": activeAttempt.quoteId } : {}) }, body: JSON.stringify(activeAttempt.body),
      });
      await SecureStore.deleteItemAsync(cartStorageKeys.pending);
      setPending(null); setQuoteDraft(null); setQuote(null); setReceipt(result); setCart({}); setSelectedModifiers({});
      await Promise.all([SecureStore.deleteItemAsync(cartStorageKeys.cart), SecureStore.deleteItemAsync(cartStorageKeys.modifiers)]);
      setHistory((current) => [result, ...current.filter((item) => item.requestId !== result.requestId)]); setHistoryOwner(session.email); setHistoryLoaded(true); setNotice("El restaurante recibió tu solicitud y debe revisar cobertura y disponibilidad.");
    } catch (cause) {
      if (orderAttempt && cause instanceof ApiError && ((cause.status != null && cause.status >= 400 && cause.status < 500) || cause.status === 503)) {
        setPending(null); setQuoteDraft(null); setQuote(null); void SecureStore.deleteItemAsync(cartStorageKeys.pending);
      } else if (orderAttempt) setPending(orderAttempt);
      setError(cause instanceof ApiError ? cause.message : "No se confirmó el resultado. Reintenta la misma solicitud.");
    } finally { setSending(false); }
  }

  async function cancelRequest(requestId: string) {
    setCancelling(requestId); setError("");
    try {
      await request(`/api/v1/client/delivery-requests/${requestId}`, { method: "DELETE" });
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

  async function toggleDetails(requestId: string) {
    if (details?.requestId === requestId) { setDetails(null); return; }
    setDetailsLoading(requestId); setHistoryError("");
    try { setDetails(await request<DeliveryRequestDetails>(`/api/v1/client/delivery-requests/${requestId}`)); }
    catch (cause) { setHistoryError(cause instanceof ApiError ? cause.message : "No pudimos cargar el detalle de esta solicitud."); }
    finally { setDetailsLoading(null); }
  }

  async function saveAddress() {
    if (!session) { setAddressError("Inicia sesión para guardar una dirección."); return; }
    if (!addressLabel.trim() || address.trim().length < 5 || !isValidGuatemalaPhone(contactPhone)) {
      setAddressError("Completa nombre, dirección y teléfono de Guatemala (8 dígitos en formato 0000 0000)."); return;
    }
    setSavingAddress(true); setAddressError(""); setAddressNotice("");
    try {
      const body = { label: addressLabel.trim(), address: address.trim(), reference: reference.trim() || null,
        contactPhone: contactPhone.trim(), isDefault: saveAsDefault };
      const saved = selectedAddress
        ? await request<CustomerAddress>(`/api/v1/client/addresses/${selectedAddress.addressId}`, {
            method: "PUT", body: JSON.stringify({ ...body, expectedVersion: selectedAddress.version }),
          })
        : await request<CustomerAddress>("/api/v1/client/addresses", { method: "POST", body: JSON.stringify(body) });
      setSavedAddresses((current) => [saved, ...current.filter((item) => item.addressId !== saved.addressId)
        .map((item) => saveAsDefault ? { ...item, isDefault: false } : item)]);
      setSelectedAddress(saved); setAddressOwner(session.email); setAddressNotice("Guardamos la dirección en tu cuenta Cliente.");
    } catch (cause) { setAddressError(cause instanceof ApiError ? cause.message : "No pudimos guardar la dirección."); }
    finally { setSavingAddress(false); }
  }

  return <ScrollView contentContainerStyle={{ flexGrow: 1 }}><Page>
    <Heading eyebrow="Entrega a domicilio">Solicitar delivery</Heading>
    {deliveryService === "paused" ? <Notice>Las solicitudes delivery están pausadas temporalmente. Puedes conservar el carrito y volver a intentarlo cuando el servicio esté disponible.</Notice> : null}
    {deliveryService === "manual-approval" ? <Notice>El equipo revisará y confirmará cada solicitud de delivery antes de aceptarla.</Notice> : null}
    {deliveryService === "unknown" ? <Notice tone={serviceStatusError ? "error" : "info"}>{serviceStatusError || (serviceStatusLoading ? "Consultando el estado de delivery…" : "El restaurante no publicó el estado de delivery.")}</Notice> : null}
    <Notice>El equipo debe confirmar cobertura, productos y horario. Esta solicitud no es un pedido aceptado, no reserva inventario y todavía no genera un cobro.</Notice>
    {session?.offline ? <Notice>Sin conexión: conserva la solicitud para reintentar manualmente cuando vuelva el acceso al servidor.</Notice> : null}
    {error ? <Notice tone="error">{error}</Notice> : null}
    {notice ? <Notice tone="success">{notice}</Notice> : null}
    {receipt ? <Card><Text style={{ color: palette.ink, fontWeight: "800" }}>Solicitud recibida · {receipt.requestId.slice(0, 8)}</Text><Text style={ui.body}>Estado: pendiente de revisión. Preferencia de pago: {paymentLabel(receipt.paymentPreference)}. No se ha realizado ningún pago.{receipt.invoiceRequested ? " Los datos de factura quedaron solicitados; todavía no se emitió FEL." : ""}</Text></Card> : null}
    {session ? <Card>
      <Heading eyebrow="Historial">Tus solicitudes delivery</Heading>
      {historyError ? <Notice tone="error">{historyError}</Notice> : null}
      {(!historyLoaded || historyLoading) && !visibleHistory.length ? <Text style={ui.body}>Cargando solicitudes…</Text> : null}
      {historyLoaded && !historyLoading && !visibleHistory.length ? <Text style={ui.body}>Aún no tienes solicitudes delivery.</Text> : null}
      {visibleHistory.map((item) => <View key={item.requestId} style={{ borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 12, gap: 8 }}>
        <Text style={{ color: palette.ink, fontWeight: "800" }}>Solicitud {item.requestId.slice(0, 8)} · {requestStatus(item.status)}</Text>
        <Text style={ui.body}>{formatMoney(item.subtotal, item.currency)} · {paymentLabel(item.paymentPreference)}</Text>
        {item.orderCode ? <Notice tone="success">Pedido {item.orderCode} · {orderStatus(item.orderStatus)}.{item.estimatedReadyAt ? ` Listo estimado: ${formatRestaurantDateTime(item.estimatedReadyAt)}.` : ""}</Notice> : null}
        {item.dispatchStatus ? <Notice tone={item.dispatchStatus === "DELIVERY_FAILED" ? "error" : "info"}>
          Reparto: {dispatchStatusLabel(item.dispatchStatus)}.{item.assignedAt ? ` Asignado ${formatRestaurantDateTime(item.assignedAt)}.` : ""}{item.dispatchedAt ? ` Salió del restaurante ${formatRestaurantDateTime(item.dispatchedAt)}.` : ""}{item.deliveredAt ? ` Entregado ${formatRestaurantDateTime(item.deliveredAt)}.` : ""}
        </Notice> : null}
        {item.invoiceRequested ? <Text style={ui.body}>Factura solicitada para {item.invoiceName} · NIT {item.invoiceTaxId}. Aún no emitida.</Text> : null}
        {item.message ? <Text style={ui.body}>{item.message}</Text> : null}
        {item.status === "REJECTED" && item.decisionReason ? <Notice tone="error">Motivo: {item.decisionReason}</Notice> : null}
        <Button title={details?.requestId === item.requestId ? "Ocultar detalle" : "Ver detalle"} secondary busy={detailsLoading === item.requestId} onPress={() => void toggleDetails(item.requestId)} />
        {details?.requestId === item.requestId ? <View style={ui.section}>
          <Text style={ui.body}>Horario solicitado: {new Date(details.requestedFor).toLocaleString("es-GT", { dateStyle: "medium", timeStyle: "short" })}</Text>
          {details.customerNote ? <Text style={ui.body}>Comentario: {details.customerNote}</Text> : null}
          {details.invoiceRequested ? <Text style={ui.body}>Factura solicitada para {details.invoiceName} · NIT {details.invoiceTaxId}. Aún no emitida.</Text> : null}
          {details.items.map((line, index) => <Text key={`${line.name}-${index}`} style={ui.body}>
            {line.quantity} × {line.name}{line.modifiers.length ? ` · ${line.modifiers.map((modifier) => `${modifier.group}: ${modifier.name}`).join(", ")}` : ""} · {formatMoney(line.lineTotal, item.currency)}
          </Text>)}
          <Text style={{ color: palette.ink, fontWeight: "800" }}>Subtotal: {formatMoney(details.subtotal, details.currency)}</Text>
          <Notice>Los precios mostrados son la captura de tu solicitud. El equipo debe revisar cobertura y confirmar antes de que exista un pedido aceptado.</Notice>
        </View> : null}
        {item.status === "PENDING_REVIEW" ? <Button title="Cancelar solicitud" secondary busy={cancelling === item.requestId} disabled={Boolean(cancelling)} onPress={() => void cancelRequest(item.requestId)} /> : null}
      </View>)}
      <Button title="Actualizar historial" secondary busy={historyLoading} onPress={() => void refreshHistory()} />
    </Card> : null}
    {pending ? <Card><Notice>Hay una solicitud sin resultado confirmado, protegida para {pending.email}. Reintenta el mismo contenido para evitar duplicados.</Notice>
      {session?.email === pending.email ? <Button title="Reintentar solicitud delivery" busy={sending} onPress={() => void submit(pending)} /> : null}</Card> : null}
    {loading ? <Card><Text style={ui.body}>Cargando menú oficial…</Text></Card> : null}
    {!loading && !products.length && !error ? <Card><Text style={{ color: palette.ink, fontWeight: "800" }}>Aún no hay productos publicados</Text><Text style={ui.body}>El catálogo aparecerá cuando el restaurante publique su menú.</Text></Card> : null}
    {products.map((item) => <Card key={item.id}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}><Text style={{ flex: 1, color: palette.ink, fontWeight: "800" }}>{item.name}</Text><Text style={{ color: palette.red, fontWeight: "800" }}>{formatMoney(menuItemUnitPrice(item, selectedModifiers[item.id]), item.currency)}</Text></View>
      {item.description ? <Text style={ui.body}>{item.description}</Text> : null}
      <MenuItemOptions item={item} selectedIds={selectedModifiers[item.id] ?? []}
        onChange={(ids) => changeModifiers(item, ids)} disabled={Boolean(pending)} />
      <View style={ui.row}><Button title="−" secondary disabled={Boolean(pending) || !cart[item.id]} onPress={() => changeQuantity(item, -1)} /><Text style={ui.body}>{cart[item.id] ?? 0}</Text><Button title="Agregar" disabled={Boolean(pending) || cart[item.id] === MAX_API_INTEGER || !menuModifiersAreValid(item.modifierGroups, selectedModifiers[item.id])} onPress={() => changeQuantity(item, 1)} /></View>
    </Card>)}
    {!pending ? <Card>
      <Heading eyebrow="Datos de entrega">¿A dónde lo llevamos?</Heading>
      {selected.length ? <View style={ui.section}>
        <Text style={{ color: palette.ink, fontWeight: "800" }}>Resumen del pedido</Text>
        {selected.map((item) => {
          const names = (item.modifierGroups ?? []).flatMap((group) => group.options
            .filter((option) => (selectedModifiers[item.id] ?? []).includes(option.id)).map((option) => option.name));
          return <Text key={item.id} style={ui.body}>{cart[item.id]} × {item.name}{names.length ? ` · ${names.join(", ")}` : ""} · {formatMoney(menuItemUnitPrice(item, selectedModifiers[item.id]) * cart[item.id], item.currency)}</Text>;
        })}
        <Text style={{ color: palette.ink, fontWeight: "800" }}>Subtotal estimado: {formatMoney(subtotal, selected[0].currency)}</Text>
        <Text style={ui.body}>El backend vuelve a validar precios. El carrito no reserva inventario y la solicitud requiere revisión del restaurante.</Text>
        <Button title="Revisar disponibilidad estimada" secondary busy={availabilityLoading}
          disabled={!selectionsValid || availabilityLoading || Boolean(pending)} onPress={() => void checkAvailability()} />
        {availabilityError ? <Notice tone="error">{availabilityError}</Notice> : null}
        {availability ? <AvailabilityNotice estimate={availability} products={selected} /> : null}
        {!selectionsValid ? <Notice tone="error">Completa las opciones requeridas para cada platillo.</Notice> : null}
      </View> : null}
      {session && addressOwner === session.email && savedAddresses.length ? <View style={ui.section}>
        <Text style={{ color: palette.ink, fontWeight: "800" }}>Usar una dirección guardada</Text>
        {savedAddresses.map((item) => <Button key={item.addressId} title={`${item.label}${item.isDefault ? " · Predeterminada" : ""}`} secondary={selectedAddress?.addressId !== item.addressId} onPress={() => {
          setSelectedAddress(item); setAddressLabel(item.label); setAddress(item.address); setReference(item.reference ?? "");
          setContactPhone(formatGuatemalaPhone(item.contactPhone)); setSaveAsDefault(item.isDefault);
        }} />)}
      </View> : null}
      <Field label="Dirección completa" value={address} onChangeText={setAddress} multiline maxLength={500} placeholder="Zona, calle/avenida, número o referencias de ubicación" />
      <Field label="Referencia para encontrar el lugar (opcional)" value={reference} onChangeText={setReference} maxLength={300} placeholder="Color de portón, nivel, local…" />
      <Field label="Teléfono de contacto · Guatemala" value={contactPhone} onChangeText={(value) => setContactPhone(formatGuatemalaPhone(value))} keyboardType="phone-pad" maxLength={9} placeholder="0000 0000" />
      {contactPhone && !isValidGuatemalaPhone(contactPhone) ? <Notice tone="error">Ingresa 8 dígitos en grupos de cuatro, por ejemplo 5555 0101.</Notice> : null}
      {session ? <View style={ui.section}>
        <Field label="Nombre para guardar la dirección" value={addressLabel} onChangeText={setAddressLabel} maxLength={80} />
        <Button title={saveAsDefault ? "Predeterminada para delivery · Cambiar" : "Usar como dirección predeterminada"} secondary onPress={() => setSaveAsDefault((current) => !current)} />
        {addressError ? <Notice tone="error">{addressError}</Notice> : null}
        {addressNotice ? <Notice tone="success">{addressNotice}</Notice> : null}
        <Button title={selectedAddress ? "Actualizar dirección guardada" : "Guardar dirección en mi cuenta"} secondary busy={savingAddress} disabled={!address.trim() || !isValidGuatemalaPhone(contactPhone)} onPress={() => void saveAddress()} />
      </View> : null}
      <Button title="Efectivo al recibir" secondary={paymentPreference !== "CASH_ON_DELIVERY"} onPress={() => setPaymentPreference("CASH_ON_DELIVERY")} />
      <Button title="Solicitar pago en línea" secondary={paymentPreference !== "ONLINE_PAYMENT_REQUESTED"} onPress={() => setPaymentPreference("ONLINE_PAYMENT_REQUESTED")} />
      {paymentPreference === "ONLINE_PAYMENT_REQUESTED" ? <Notice>Esta opción sólo registra tu preferencia. El cobro en línea no está habilitado aquí.</Notice> : null}
      <Button title={invoiceRequested ? "Quitar solicitud de factura" : "Solicitar factura"} secondary={!invoiceRequested} onPress={() => setInvoiceRequested((current) => !current)} />
      {invoiceRequested ? <View style={ui.section}>
        <Field label="Nombre o razón social" value={invoiceName} onChangeText={setInvoiceName} maxLength={150} />
        <Field label="NIT" value={invoiceTaxId} onChangeText={setInvoiceTaxId} maxLength={32} placeholder="CF o NIT" />
        {defaultTaxProfileLabel ? <Text style={ui.body}>Datos precargados desde tu perfil «{defaultTaxProfileLabel}». Puedes editarlos para esta solicitud.</Text> : <Link href="/tax-profiles" style={ui.link}>Administrar perfiles fiscales</Link>}
        <Notice>Guardaremos estos datos como solicitud. La factura FEL requiere revisión y emisión posterior.</Notice>
      </View> : null}
      <Field label="Horario que prefieres (hora de Guatemala)" value={requestedFor} onChangeText={(value) => { clearQuoteDraft(); setRequestedFor(value); }} placeholder="AAAA-MM-DDTHH:mm" />
      <ServiceHoursNotice serviceName="delivery" localDateTime={requestedFor} day={publishedHours.day}
        loading={publishedHours.loading} error={publishedHours.error} />
      <Text style={ui.body}>Zona horaria del restaurante: {restaurantTimeZone}.</Text>
      <Button title="Sugerir horario inicial" secondary onPress={suggestTime} disabled={!selected.length || Boolean(pending)} />
      <Field label="Comentarios para el restaurante (opcional)" value={customerNote} onChangeText={setCustomerNote} maxLength={500} multiline />
      {selected.length === 0 ? <Notice>Agrega al menos un producto.</Notice> : null}
      {quote ? <View style={ui.section}>
        <Notice tone="success">Cotización del servidor: {formatMoney(quote.subtotal, quote.currency)} · cola activa {Math.ceil(quote.queueDelaySeconds / 60)} min · preparación propia {Math.ceil(quote.preparationSeconds / 60)} min · ETA total estimado {Math.ceil(quote.totalEtaSeconds / 60)} min. Vence {new Date(quote.expiresAt).toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" })}.</Notice>
        <Notice>La cotización no aparta inventario ni capacidad y no acepta el pedido. El equipo revisará cobertura y disponibilidad.</Notice>
        <Button title="Solicitar una nueva cotización" secondary disabled={sending} onPress={clearQuoteDraft} />
      </View> : null}
      <Button title={pending ? "Reintentar solicitud pendiente" : quote?.usable ? "Confirmar y enviar solicitud" : "Cotizar con el servidor"}
        busy={sending} disabled={(deliveryService === "paused" && !pending && !quoteDraft) || !session || !cartRestored || !selected.length || !selectionsValid || !address.trim() || !isValidGuatemalaPhone(contactPhone)} onPress={() => void submit()} />
    </Card> : null}
  </Page></ScrollView>;
}

async function fetchMenu() {
  return apiRequest<PublicMenu>("/api/v1/public/menu");
}

function validCart(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([id, quantity]) =>
    /^[0-9a-f-]{36}$/i.test(id) && typeof quantity === "number"
      && isValidPositiveApiInteger(quantity),
  )) as Record<string, number>;
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

function orderStatus(value: DeliveryRequestReceipt["orderStatus"]) {
  const labels: Record<NonNullable<DeliveryRequestReceipt["orderStatus"]>, string> = {
    SENT: "enviado a cocina", PREPARING: "en preparación", READY: "listo para despacho",
    SERVED: "entregado", CLOSED: "cerrado", CANCELLED: "cancelado",
  };
  return value ? labels[value] : "confirmado";
}

function dispatchStatusLabel(value: NonNullable<DeliveryRequestReceipt["dispatchStatus"]>) {
  const labels: Record<NonNullable<DeliveryRequestReceipt["dispatchStatus"]>, string> = {
    AWAITING_KITCHEN: "en preparación",
    READY_FOR_DISPATCH: "esperando asignación de reparto",
    ASSIGNED: "repartidor asignado",
    OUT_FOR_DELIVERY: "en camino",
    DELIVERY_FAILED: "el equipo debe revisar un inconveniente",
    DELIVERED: "entregado",
    CANCELLED: "cancelado",
  };
  return labels[value];
}
