import * as Crypto from "expo-crypto";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, Text, View } from "react-native";
import { Button, Card, Field, Heading, Notice, Page, palette, ui } from "@/components/ui";
import { ApiError, PublicMenu, ReservationCapacityEvaluation, ReservationHistoryItem, ReservationPreorderItem, ReservationResult, apiRequest } from "@/lib/api";
import { PublicServiceCapability, reservationServiceState } from "@/lib/reservation-service-status";
import { parsePendingReservationAttempt, PendingReservationAttempt, resolvePendingReservationAttempt } from "@/lib/reservation-attempt";
import { deleteSecurePayload, readSecurePayload, saveSecurePayload } from "@/lib/reservation-attempt-storage";
import { legacyReservationDraftKey, reservationStorageKeys } from "@/lib/reservation-storage-keys";
import { formatRestaurantDateTime, formatRestaurantLocalInput, parseRestaurantLocalDateTime, restaurantTimeZone } from "@/lib/restaurant-time";
import { MenuItemOptions } from "@/components/menu-item-options";
import { menuItemUnitPrice, menuModifiersAreValid } from "@/lib/menu-options";
import { buildReservationPreorderItems } from "@/lib/reservation-preorder";
import { useSession } from "@/providers/session-provider";
import { useFocusedPolling } from "@/lib/use-focused-polling";
import { isValidPositiveApiInteger, MAX_API_INTEGER } from "@/lib/quantity-limits";

export default function ReservationsScreen() {
  const { session, request } = useSession();
  return <ReservationForm key={session?.email ?? "guest"} session={session} request={request} />;
}

function ReservationForm({ session, request }: Pick<ReturnType<typeof useSession>, "session" | "request">) {
  const [guests, setGuests] = useState("2");
  const [requestedAt, setRequestedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [preorder, setPreorder] = useState(false);
  const [menu, setMenu] = useState<PublicMenu | null>(null);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuError, setMenuError] = useState("");
  const [menuReload, setMenuReload] = useState(0);
  const [preorderQuantities, setPreorderQuantities] = useState<Record<string, number>>({});
  const [preorderModifiers, setPreorderModifiers] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [submissionAlternatives, setSubmissionAlternatives] = useState<string[]>([]);
  const [messageTone, setMessageTone] = useState<"info" | "success">("info");
  const [error, setError] = useState("");
  const [history, setHistory] = useState<ReservationHistoryItem[]>([]);
  const [serviceCapabilities, setServiceCapabilities] = useState<PublicServiceCapability[] | null>(null);
  const [serviceStatusError, setServiceStatusError] = useState("");
  const [serviceStatusLoading, setServiceStatusLoading] = useState(true);
  const [evaluation, setEvaluation] = useState<ReservationCapacityEvaluation | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluationError, setEvaluationError] = useState("");
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
  const evaluationRevision = useRef(0);
  const historyRefreshInFlight = useRef(false);

  useEffect(() => {
    let active = true;
    if (!session?.email) return () => { active = false; };
    void Promise.resolve().then(async () => {
      if (Platform.OS !== "web") {
        const storageKeys = await getReservationStorageKeys(session.email);
        let raw = await readSecurePayload(storageKeys.draft);
        if (!raw) {
          const legacy = await readSecurePayload(legacyReservationDraftKey);
          const legacyDraft = legacy ? parseReservationDraft(legacy) : null;
          if (legacy && legacyDraft && normalizeEmail(legacyDraft.ownerEmail) === normalizeEmail(session.email)) {
            raw = legacy;
            await saveSecurePayload(storageKeys.draft, legacy);
            await deleteSecurePayload(legacyReservationDraftKey);
          } else if (legacy && !legacyDraft) {
            await deleteSecurePayload(legacyReservationDraftKey);
          }
        }
        if (raw) {
          const draft = parseReservationDraft(raw);
          if (draft && normalizeEmail(draft.ownerEmail) === normalizeEmail(session.email) && Date.now() - draft.savedAt < reservationDraftLifetimeMs) {
            if (active) {
              setGuests(draft.guests);
              setRequestedAt(draft.requestedAt);
              setNotes(draft.notes);
              setPreorder(draft.preorder);
              setPreorderQuantities(draft.preorderQuantities ?? {});
              setPreorderModifiers(draft.preorderModifiers ?? {});
              setDraftRestored(true);
            }
          } else if (draft && Date.now() - draft.savedAt >= reservationDraftLifetimeMs) {
            await deleteSecurePayload(storageKeys.draft);
          } else if (!draft || normalizeEmail(draft.ownerEmail) !== normalizeEmail(session.email)) {
            await deleteSecurePayload(storageKeys.draft);
          }
        }
        const rawAttempt = await readSecurePayload(storageKeys.attempt);
        if (rawAttempt) {
          const attempt = parsePendingReservationAttempt(rawAttempt);
          if (attempt && attempt.ownerEmail === session.email) {
            if (active) {
              pendingRequest.current = attempt;
              setAttemptRestored(true);
            }
          } else {
            await deleteSecurePayload(storageKeys.attempt);
          }
        }
      }
    }).catch(() => { if (active) setDraftError("No se pudo leer el borrador guardado en este dispositivo."); })
      .finally(() => { if (active) setDraftReady(true); });
    return () => { active = false; };
  }, [session?.email]);

  useEffect(() => {
    if (!session?.email || !draftReady || Platform.OS === "web" || !hasReservationDraft(guests, requestedAt, notes, preorder, preorderQuantities)) return;
    const draft: ReservationDraft = {
      ownerEmail: session.email, guests, requestedAt, notes, preorder, preorderQuantities, preorderModifiers, savedAt: Date.now(),
    };
    const storageKeys = getReservationStorageKeys(session.email);
    const timer = setTimeout(() => {
      void storageKeys.then((keys) => saveSecurePayload(keys.draft, JSON.stringify(draft)))
        .then(() => setDraftError(""))
        .catch(() => setDraftError("No se pudo guardar el borrador en este dispositivo."));
    }, 350);
    return () => clearTimeout(timer);
  }, [session?.email, draftReady, guests, requestedAt, notes, preorder, preorderQuantities, preorderModifiers]);

  useEffect(() => {
    if (!preorder || menu) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (active) { setMenuLoading(true); setMenuError(""); }
      return apiRequest<PublicMenu>("/api/v1/public/menu");
    }).then((result) => { if (active) setMenu(result); })
      .catch((cause: unknown) => { if (active) setMenuError(cause instanceof Error ? cause.message : "No pudimos cargar el menú."); })
      .finally(() => { if (active) setMenuLoading(false); });
    return () => { active = false; };
  }, [preorder, menu, menuReload]);

  const refreshHistory = useCallback(async () => {
    if (!session) { setHistory([]); return; }
    if (historyRefreshInFlight.current) return;
    historyRefreshInFlight.current = true;
    setHistoryLoading(true); setHistoryError("");
    try { setHistory(await request<ReservationHistoryItem[]>("/api/v1/client/reservations")); }
    catch (e) { setHistoryError(e instanceof Error ? e.message : "No se pudo cargar tu historial."); }
    finally { historyRefreshInFlight.current = false; setHistoryLoading(false); }
  }, [request, session]);

  useEffect(() => { void Promise.resolve().then(refreshHistory); }, [refreshHistory]);

  const hasPendingReservations = history.some((item) => item.reservationStatus === "REQUESTED");
  useFocusedPolling(refreshHistory, 30_000, Boolean(session && !session.offline && hasPendingReservations));

  const refreshReservationService = useCallback(async () => {
    setServiceStatusLoading(true);
    try {
      const capabilities = await apiRequest<PublicServiceCapability[]>("/api/v1/public/service-capabilities");
      setServiceCapabilities(capabilities);
      setServiceStatusError("");
    } catch (cause) {
      setServiceStatusError(cause instanceof ApiError ? cause.message : "No pudimos consultar el estado de las reservas.");
    } finally { setServiceStatusLoading(false); }
  }, []);

  useEffect(() => { void Promise.resolve().then(refreshReservationService); }, [refreshReservationService]);
  useFocusedPolling(refreshReservationService, 60_000, true);
  const reservationService = reservationServiceState(serviceCapabilities);

  async function evaluateSchedule() {
    setEvaluation(null); setEvaluationError("");
    const date = parseRestaurantLocalDateTime(requestedAt);
    const count = Number(guests);
    if (!isValidPositiveApiInteger(count)) { setEvaluationError("Indica una cantidad entera válida de personas."); return; }
    if (!date) { setEvaluationError("Indica una fecha y hora válidas en la hora de Guatemala."); return; }
    const revision = ++evaluationRevision.current;
    setEvaluating(true);
    try {
      const result = await request<ReservationCapacityEvaluation>("/api/v1/public/reservations/evaluate", {
        method: "POST", body: JSON.stringify({ guests: count, requestedAt: date.toISOString(), preorder }),
      });
      if (revision === evaluationRevision.current) setEvaluation(result);
    } catch (cause) {
      if (revision === evaluationRevision.current)
        setEvaluationError(cause instanceof Error ? cause.message : "No pudimos evaluar ese horario.");
    } finally { if (revision === evaluationRevision.current) setEvaluating(false); }
  }

  function clearEvaluation() {
    evaluationRevision.current += 1;
    setEvaluation(null); setEvaluationError(""); setEvaluating(false);
  }

  async function submit() {
    setError(""); setMessage(""); setSubmissionAlternatives([]);
    if (reservationService === "paused" && !attemptRestored) { setError("El restaurante pausó temporalmente las solicitudes de reserva."); return; }
    if (!session) { setError("Inicia sesión desde Mi cuenta para enviar una solicitud."); return; }
    const date = parseRestaurantLocalDateTime(requestedAt);
    const count = Number(guests);
    if (!isValidPositiveApiInteger(count)) { setError("Indica una cantidad entera válida de personas."); return; }
    if (!date) { setError("Indica una fecha y hora válidas en la hora de Guatemala."); return; }
    if (date.getTime() < Date.now() + 3 * 60 * 60 * 1000) { setError("Las solicitudes requieren al menos 3 horas de anticipación."); return; }
    let items: ReservationPreorderItem[];
    try { items = preorder ? buildReservationPreorderItems((menu?.categories ?? []).flatMap((category) => category.items), preorderQuantities, preorderModifiers) : []; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Revisa los productos de la preorden."); return; }
    const body = JSON.stringify({ guests: count, requestedAt: date.toISOString(), preorder, notes: notes.trim() || null, items });
    const attempt = resolvePendingReservationAttempt(pendingRequest.current, session.email, body, createRequestKey);
    pendingRequest.current = attempt;
    if (Platform.OS !== "web") {
      try {
        const storageKeys = await getReservationStorageKeys(session.email);
        await saveSecurePayload(storageKeys.attempt, JSON.stringify(attempt));
      }
      catch {
        pendingRequest.current = null;
        setError("No pudimos guardar el intento de forma segura; no enviamos la solicitud para evitar duplicados.");
        return;
      }
    }
    setAttemptRestored(true);
    setBusy(true);
    try {
      const result = await request<ReservationResult>("/api/v1/client/reservations", {
        method: "POST", headers: { "Idempotency-Key": attempt.key }, body,
      });
      pendingRequest.current = null;
      if (Platform.OS !== "web") {
        try {
          const storageKeys = await getReservationStorageKeys(session.email);
          await deleteSecurePayload(storageKeys.draft);
          await deleteSecurePayload(storageKeys.attempt);
        } catch { setDraftError("La solicitud respondió, pero no pudimos borrar todo el estado local."); }
      }
      setDraftRestored(false);
      setAttemptRestored(false);
      setGuests("2"); setRequestedAt(""); setNotes(""); setPreorder(false); setPreorderQuantities({}); setPreorderModifiers({});
      setMessageTone(result.submitted ? "success" : "info");
      setMessage(result.message || (result.submitted
        ? "Solicitud enviada; el equipo debe revisarla y confirmarla."
        : `La solicitud no fue aceptada automáticamente (${result.decision}).`));
      setSubmissionAlternatives(result.alternativeTimes ?? []);
      void refreshHistory();
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        pendingRequest.current = null;
        setAttemptRestored(false);
        if (Platform.OS !== "web") {
          try { await deleteSecurePayload((await getReservationStorageKeys(session.email)).attempt); }
          catch { setDraftError("El servidor rechazó los datos, pero no pudimos borrar el intento local."); }
        }
      }
      setError(e instanceof Error ? e.message : "No se pudo enviar la solicitud.");
    }
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
    {reservationService === "paused" ? <Notice>Las solicitudes de reserva están pausadas temporalmente. Puedes conservar tu borrador y volver a intentarlo cuando el servicio esté disponible.</Notice> : null}
    {reservationService === "unknown" ? <Notice tone={serviceStatusError ? "error" : "info"}>{serviceStatusError || (serviceStatusLoading ? "Consultando si el servicio de reservas está disponible…" : "El restaurante no publicó el estado del servicio de reservas. El equipo confirmará la solicitud.")}</Notice> : null}
    {draftRestored ? <Notice tone="success">Restauramos tu borrador guardado en este dispositivo.</Notice> : null}
    {attemptRestored ? <Notice tone="error">Hay un envío anterior cuyo resultado no se pudo confirmar. Al reenviar la misma información usaremos la misma clave para evitar duplicar la solicitud.</Notice> : null}
    {session && Platform.OS !== "web" ? <Notice>El borrador se guarda en este dispositivo. Nunca se envía automáticamente al recuperar conexión.</Notice> : null}
    {draftError ? <Notice tone="error">{draftError}</Notice> : null}
    <Card>
      <Field label="Personas" keyboardType="number-pad" value={guests} editable={!attemptRestored} onChangeText={(value) => { setGuests(value); clearEvaluation(); }} placeholder="2" />
      <Field label="Fecha y hora de Guatemala" value={requestedAt} editable={!attemptRestored} onChangeText={(value) => { setRequestedAt(value); clearEvaluation(); }} placeholder="2026-10-05T18:30" autoCapitalize="none" />
      <Text style={{ color: "#746e67", fontSize: 13 }}>Hora del restaurante ({restaurantTimeZone}), AAAA-MM-DDTHH:mm. Solicita con al menos 3 horas de anticipación.</Text>
      <Field label="Solicitudes especiales (opcional)" value={notes} editable={!attemptRestored} onChangeText={setNotes} placeholder="Cuéntanos cómo podemos ayudarte" multiline numberOfLines={3} maxLength={500} textAlignVertical="top" />
      <Button title={preorder ? "Preorden: sí (tocar para cambiar)" : "¿Deseas solicitar preorden? No"} secondary disabled={attemptRestored} onPress={() => { setPreorder(!preorder); clearEvaluation(); }} />
      {preorder ? <View style={ui.section}>
        <Text style={ui.body}>El equipo revisará los productos junto con la reserva. Esta solicitud no confirma platillos ni aparta inventario.</Text>
        {menuLoading ? <ActivityIndicator accessibilityLabel="Cargando menú" color={palette.red} /> : null}
        {menuError ? <View style={ui.section}><Notice tone="error">{menuError}</Notice><Button title="Reintentar menú" secondary onPress={() => setMenuReload((value) => value + 1)} /></View> : null}
        {menu && menu.categories.flatMap((category) => category.items).length === 0 ? <Notice>Aún no hay productos publicados para preordenar.</Notice> : null}
        {menu?.categories.flatMap((category) => category.items).map((item) => {
          const quantity = preorderQuantities[item.id] ?? 0;
          const selectedIds = preorderModifiers[item.id] ?? [];
          const money = new Intl.NumberFormat("es-GT", { style: "currency", currency: item.currency });
          return <Card key={item.id}>
            <Text style={{ color: palette.ink, fontWeight: "800" }}>{item.name} · {money.format(menuItemUnitPrice(item, selectedIds))}</Text>
            {item.ageRestricted ? <Notice>Producto +18 · consulta al personal sobre disponibilidad y requisitos.</Notice> : null}
            {item.description ? <Text style={ui.body}>{item.description}</Text> : null}
            <MenuItemOptions item={item} selectedIds={selectedIds} disabled={attemptRestored || busy}
              onChange={(ids) => { setPreorderModifiers((current) => ({ ...current, [item.id]: ids })); clearEvaluation(); }} />
            <View style={ui.row}>
              <Button title="−" secondary disabled={quantity === 0 || attemptRestored || busy} onPress={() => { setPreorderQuantities((current) => ({ ...current, [item.id]: Math.max(0, (current[item.id] ?? 0) - 1) })); clearEvaluation(); }} />
              <Text style={ui.body}>{quantity}</Text>
              <Button title="Agregar" disabled={attemptRestored || busy || quantity >= MAX_API_INTEGER || !menuModifiersAreValid(item.modifierGroups, selectedIds)}
                onPress={() => { setPreorderQuantities((current) => ({ ...current, [item.id]: (current[item.id] ?? 0) + 1 })); clearEvaluation(); }} />
            </View>
          </Card>;
        })}
        {Object.values(preorderQuantities).reduce((sum, value) => sum + value, 0) > 0 ? <Notice>
          Productos solicitados: {Object.values(preorderQuantities).reduce((sum, value) => sum + value, 0)}. El precio y la disponibilidad se revisarán al procesar la solicitud.
        </Notice> : null}
      </View> : null}
      {evaluationError ? <Notice tone="error">{evaluationError}</Notice> : null}
      {evaluation ? <Notice tone="info">
        {evaluation.assessment.publicMessage}{evaluation.assessment.occupancy
          ? ` Estancia orientativa: ${evaluation.assessment.occupancy.minimumMinutes}–${evaluation.assessment.occupancy.maximumMinutes} min.` : ""} Esta evaluación no confirma una reserva; al enviar se volverá a revisar.
      </Notice> : null}
      {evaluation?.assessment.alternativeTimes.map((alternative) => <Button key={alternative}
        title={`Probar ${formatDate(alternative)}`} secondary disabled={busy || evaluating || attemptRestored}
        onPress={() => { setRequestedAt(formatRestaurantLocalInput(alternative)); clearEvaluation(); }} />)}
      {submissionAlternatives.map((alternative) => <Button key={alternative}
        title={`Probar ${formatDate(alternative)}`} secondary disabled={busy || attemptRestored}
        onPress={() => { setRequestedAt(formatRestaurantLocalInput(alternative)); setSubmissionAlternatives([]); }} />)}
      <Button title="Evaluar horario orientativo" secondary busy={evaluating} disabled={busy || evaluating || attemptRestored} onPress={() => void evaluateSchedule()} />
      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone={messageTone}>{message}</Notice> : null}
      <Button title={attemptRestored ? "Reintentar solicitud pendiente" : "Enviar solicitud"} busy={busy} disabled={(reservationService === "paused" && !attemptRestored) || Boolean(session && Platform.OS !== "web" && !draftReady)} onPress={submit} />
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
        {item.preorderItems?.length ? <View style={ui.section}>
          <Text style={{ color: palette.ink, fontWeight: "800" }}>Preorden solicitada · pendiente de revisión</Text>
          {item.preorderItems.map((product) => {
            const money = new Intl.NumberFormat("es-GT", { style: "currency", currency: product.currency });
            return <Text key={product.menuItemId} style={ui.body}>
              {product.quantity} × {product.name}{product.modifiers.length ? ` · ${product.modifiers.map((modifier) => `${modifier.group}: ${modifier.name}`).join(", ")}` : ""}
              {` · ${money.format(product.unitPrice)} c/u`}
            </Text>;
          })}
          <Text style={{ color: "#746e67", fontSize: 13 }}>El menú y el precio pueden cambiar; estos son los datos de tu solicitud al enviarla.</Text>
        </View> : null}
        {item.alternativeTimes?.map((alternative) => <Button key={alternative}
          title={`Probar ${formatDate(alternative)}`} secondary disabled={busy || attemptRestored}
          onPress={() => { setRequestedAt(formatRestaurantLocalInput(alternative)); setSubmissionAlternatives([]); }} />)}
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
  preorderQuantities: Record<string, number>;
  preorderModifiers: Record<string, string[]>;
  savedAt: number;
};

const reservationDraftLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getReservationStorageKeys(ownerEmail: string) {
  const draftOwnerHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, normalizeEmail(ownerEmail));
  const attemptOwnerHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, ownerEmail);
  return reservationStorageKeys(draftOwnerHash, attemptOwnerHash);
}

function normalizeEmail(value: string) { return value.trim().toLowerCase(); }

function parseReservationDraft(raw: string): ReservationDraft | null {
  if (raw.length > 30000) return null;
  try {
    const value = JSON.parse(raw) as Partial<ReservationDraft>;
    if (typeof value.ownerEmail !== "string" || typeof value.guests !== "string" ||
        typeof value.requestedAt !== "string" || typeof value.notes !== "string" ||
        typeof value.preorder !== "boolean" || typeof value.savedAt !== "number") return null;
    const rawQuantities = value.preorderQuantities ?? {};
    const rawModifiers = value.preorderModifiers ?? {};
    if (!rawQuantities || typeof rawQuantities !== "object" || Array.isArray(rawQuantities) ||
        !rawModifiers || typeof rawModifiers !== "object" || Array.isArray(rawModifiers)) return null;
    const preorderQuantities = Object.fromEntries(Object.entries(rawQuantities).filter(([id, quantity]) =>
      idPattern.test(id) && isValidPositiveApiInteger(quantity))) as Record<string, number>;
    const preorderModifiers = Object.fromEntries(Object.entries(rawModifiers).filter(([id, ids]) => idPattern.test(id) &&
      Array.isArray(ids) && ids.length <= 30 && ids.every((modifierId) => typeof modifierId === "string" && idPattern.test(modifierId)))) as Record<string, string[]>;
    return { ...value, preorderQuantities, preorderModifiers } as ReservationDraft;
  } catch { return null; }
}

function hasReservationDraft(guests: string, requestedAt: string, notes: string, preorder: boolean, quantities: Record<string, number>) {
  return guests !== "2" || requestedAt.length > 0 || notes.length > 0 || preorder || Object.values(quantities).some((quantity) => quantity > 0);
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
