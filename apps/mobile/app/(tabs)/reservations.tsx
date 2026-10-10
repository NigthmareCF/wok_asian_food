import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import {
  Button,
  Card,
  Field,
  Heading,
  Notice,
  Page,
  StatusChip,
  useUiTheme,
} from "@/components/ui";
import {
  ReservationDateTime,
  stepGuests,
} from "@/components/reservation-date-time";
import { ReservationHistoryItem, ReservationResult } from "@/lib/api";
import { useSession } from "@/providers/session-provider";
import {
  restaurantInstant,
  reservationTimeError,
  reservationPolicySchema,
  type ReservationPolicy,
} from "@/lib/slot-time";

export default function ReservationsScreen() {
  const { colors, ui } = useUiTheme();
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
  const [cancellingReservationId, setCancellingReservationId] = useState<
    string | null
  >(null);
  const [cancellationError, setCancellationError] = useState("");
  const [cancellationNotice, setCancellationNotice] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftError, setDraftError] = useState("");
  const pendingRequest = useRef<{ body: string; key: string } | null>(null);
  const [policy, setPolicy] = useState<{
    owner: string;
    value: ReservationPolicy;
  } | null>(null);
  const [policyError, setPolicyError] = useState("");
  const [policyRefresh, setPolicyRefresh] = useState(0);
  const currentPolicy =
    policy?.owner === session?.email ? policy?.value : undefined;

  useEffect(() => {
    let active = true;
    if (!session) return;
    void request<unknown>("/api/v1/client/reservations/policy")
      .then((result) => {
        const value = reservationPolicySchema.parse(result);
        if (active) {
          setPolicy({ owner: session.email, value });
          setPolicyError("");
        }
      })
      .catch(() => {
        if (active)
          setPolicyError(
            "No pudimos consultar la política de solicitudes. Actualiza antes de enviar.",
          );
      });
    return () => {
      active = false;
    };
  }, [request, session, policyRefresh]);

  useEffect(() => {
    let active = true;
    if (!session?.email)
      return () => {
        active = false;
      };
    void Promise.resolve()
      .then(async () => {
        if (Platform.OS !== "web") {
          const raw = await SecureStore.getItemAsync(reservationDraftKey);
          if (raw) {
            const draft = parseReservationDraft(raw);
            if (
              draft &&
              draft.ownerEmail === session.email &&
              Date.now() - draft.savedAt < reservationDraftLifetimeMs
            ) {
              if (active) {
                setGuests(draft.guests);
                setRequestedAt(draft.requestedAt);
                setNotes(draft.notes);
                setPreorder(draft.preorder);
                setDraftRestored(true);
              }
            } else if (
              draft &&
              Date.now() - draft.savedAt >= reservationDraftLifetimeMs
            ) {
              await SecureStore.deleteItemAsync(reservationDraftKey);
            } else if (!draft) {
              await SecureStore.deleteItemAsync(reservationDraftKey);
            }
          }
        }
      })
      .catch(() => {
        if (active)
          setDraftError(
            "No se pudo leer el borrador guardado en este dispositivo.",
          );
      })
      .finally(() => {
        if (active) setDraftReady(true);
      });
    return () => {
      active = false;
    };
  }, [session?.email]);

  useEffect(() => {
    if (
      !session?.email ||
      !draftReady ||
      Platform.OS === "web" ||
      !hasReservationDraft(guests, requestedAt, notes, preorder)
    )
      return;
    const draft: ReservationDraft = {
      ownerEmail: session.email,
      guests,
      requestedAt,
      notes,
      preorder,
      savedAt: Date.now(),
    };
    const timer = setTimeout(() => {
      void SecureStore.setItemAsync(reservationDraftKey, JSON.stringify(draft))
        .then(() => setDraftError(""))
        .catch(() =>
          setDraftError("No se pudo guardar el borrador en este dispositivo."),
        );
    }, 350);
    return () => clearTimeout(timer);
  }, [session?.email, draftReady, guests, requestedAt, notes, preorder]);

  const refreshHistory = useCallback(async () => {
    if (!session) {
      setHistory([]);
      return;
    }
    setHistoryLoading(true);
    setHistoryError("");
    try {
      setHistory(
        await request<ReservationHistoryItem[]>("/api/v1/client/reservations"),
      );
    } catch (e) {
      setHistoryError(
        e instanceof Error ? e.message : "No se pudo cargar tu historial.",
      );
    } finally {
      setHistoryLoading(false);
    }
  }, [request, session]);

  useEffect(() => {
    void Promise.resolve().then(refreshHistory);
  }, [refreshHistory]);

  async function submit() {
    setError("");
    setMessage("");
    if (!session) {
      setError("Inicia sesión desde Mi cuenta para enviar una solicitud.");
      return;
    }
    const instant = restaurantInstant(requestedAt);
    const count = Number(guests);
    if (!Number.isInteger(count) || count < 1 || count > 50) {
      setError("Indica entre 1 y 50 personas.");
      return;
    }
    if (!pendingRequest.current && !instant) {
      setError("Indica una fecha y hora válidas.");
      return;
    }
    if (!pendingRequest.current && !currentPolicy) {
      setError("Consulta la política de solicitudes antes de enviar.");
      return;
    }
    const timeError = currentPolicy
      ? reservationTimeError(requestedAt, Date.now(), currentPolicy)
      : null;
    if (!pendingRequest.current && timeError) {
      setError(timeError);
      return;
    }
    const body =
      pendingRequest.current?.body ??
      JSON.stringify({
        guests: count,
        requestedAt: instant,
        preorder,
        notes: notes.trim() || null,
      });
    if (!pendingRequest.current || pendingRequest.current.body !== body)
      pendingRequest.current = { body, key: createRequestKey() };
    setBusy(true);
    try {
      const result = await request<ReservationResult>(
        "/api/v1/client/reservations",
        {
          method: "POST",
          headers: { "Idempotency-Key": pendingRequest.current.key },
          body,
        },
      );
      pendingRequest.current = null;
      if (Platform.OS !== "web") {
        try {
          await SecureStore.deleteItemAsync(reservationDraftKey);
        } catch {
          setDraftError(
            "La solicitud se envió, pero no pudimos borrar el borrador local.",
          );
        }
      }
      setDraftRestored(false);
      setGuests("2");
      setRequestedAt("");
      setNotes("");
      setPreorder(false);
      setMessageTone(result.submitted ? "success" : "info");
      setMessage(
        result.message ||
          (result.submitted
            ? "Solicitud enviada; el equipo debe revisarla y confirmarla."
            : `La solicitud no fue aceptada automáticamente (${result.decision}).`),
      );
      void refreshHistory();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo enviar la solicitud.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function cancelRequest(reservationId: string) {
    setCancellingReservationId(reservationId);
    setCancellationError("");
    setCancellationNotice("");
    try {
      await request<{ reservationId: string; status: string }>(
        `/api/v1/client/reservations/${reservationId}`,
        { method: "DELETE" },
      );
      setCancellationNotice("Cancelamos tu solicitud pendiente.");
      await refreshHistory();
    } catch (cause) {
      setCancellationError(
        cause instanceof Error
          ? cause.message
          : "No pudimos cancelar la solicitud.",
      );
    } finally {
      setCancellingReservationId(null);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <Page safeTop brand>
        <Heading eyebrow="Planifica tu visita">Solicitar reserva</Heading>
        <Text style={ui.body}>
          El restaurante revisará capacidad y horario. Enviar una solicitud no
          confirma la reserva.
        </Text>
        {session?.offline ? (
          <Notice>
            Sin conexión al restaurante. Puedes revisar tu borrador; enviar
            requiere conexión y confirmación del servidor.
          </Notice>
        ) : null}
        {draftRestored ? (
          <Notice tone="success">
            Restauramos tu borrador guardado en este dispositivo.
          </Notice>
        ) : null}
        {session && Platform.OS !== "web" ? (
          <Notice>
            El borrador se guarda en este dispositivo. Nunca se envía
            automáticamente al recuperar conexión.
          </Notice>
        ) : null}
        {draftError ? <Notice tone="error">{draftError}</Notice> : null}
        <Card>
          <ReservationDateTime
            value={requestedAt}
            onChange={setRequestedAt}
            disabled={busy}
            policy={currentPolicy}
            helper={
              currentPolicy
                ? `Solicita con ${currentPolicy.minimumNoticeHours} horas de anticipación, entre ${currentPolicy.firstRequestTime} y ${currentPolicy.lastRequestTime}. Es una ventana de solicitudes, no disponibilidad confirmada.`
                : "Elige tu fecha; consulta la política antes de enviar. La reserva requiere confirmación del equipo."
            }
          />
          {session && !currentPolicy ? (
            <Notice>
              {policyError || "Consultando la política de solicitudes…"}
            </Notice>
          ) : null}
          {policyError ? (
            <Button
              title="Actualizar política"
              secondary
              disabled={busy}
              onPress={() => setPolicyRefresh((value) => value + 1)}
            />
          ) : null}
          <Text className="font-sans text-base font-extrabold text-foreground">
            ¿Cuántas personas?
          </Text>
          <View className="flex-row items-center gap-4">
            <Button
              title="−"
              secondary
              accessibilityLabel="Quitar una persona"
              disabled={busy || Number(guests) <= 1}
              onPress={() => setGuests(stepGuests(guests, -1))}
            />
            <Text
              accessibilityLabel={`${guests} personas`}
              accessibilityLiveRegion="polite"
              className="min-w-11 text-center font-sans text-2xl font-extrabold text-foreground"
            >
              {guests}
            </Text>
            <Button
              title="+"
              accessibilityLabel="Agregar una persona"
              disabled={busy || Number(guests) >= 50}
              onPress={() => setGuests(stepGuests(guests, 1))}
            />
          </View>
          <Text className="font-sans text-xs text-muted-foreground">
            De 1 a 50 personas por solicitud.
          </Text>
          <Field
            label="Solicitudes especiales (opcional)"
            value={notes}
            onChangeText={setNotes}
            editable={!busy}
            placeholder="Cuéntanos cómo podemos ayudarte"
            multiline
            numberOfLines={3}
            maxLength={500}
            textAlignVertical="top"
          />
          <Button
            title={
              preorder
                ? "Preorden requerida: sí (tocar para cambiar)"
                : "¿Requieres preorden? No"
            }
            secondary
            disabled={busy}
            onPress={() => setPreorder(!preorder)}
          />
          {preorder ? (
            <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
              Esto avisa al equipo para evaluar la solicitud; aún no agrega
              productos.
            </Text>
          ) : null}
          {error ? <Notice tone="error">{error}</Notice> : null}
          {message ? <Notice tone={messageTone}>{message}</Notice> : null}
          <Notice>
            Enviar la solicitud no confirma tu reserva. Espera la respuesta del
            equipo.
          </Notice>
          {!session ? (
            <Button
              title="Iniciar sesión para reservar"
              secondary
              onPress={() => router.push("/(tabs)/account")}
            />
          ) : null}
          <Button
            title="Enviar solicitud de reserva"
            busy={busy}
            onPress={submit}
          />
        </Card>
        {session ? (
          <Card>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <Text
                style={{
                  color: colors.foreground,
                  fontSize: 20,
                  fontWeight: "800",
                  flex: 1,
                }}
              >
                Mis solicitudes
              </Text>
              {historyLoading ? (
                <ActivityIndicator
                  accessibilityLabel="Cargando solicitudes"
                  color={colors.primary}
                />
              ) : null}
            </View>
            {historyError ? <Notice tone="error">{historyError}</Notice> : null}
            {cancellationError ? (
              <Notice tone="error">{cancellationError}</Notice>
            ) : null}
            {cancellationNotice ? (
              <Notice tone="success">{cancellationNotice}</Notice>
            ) : null}
            {!historyLoading && !historyError && history.length === 0 ? (
              <Notice>Aún no tienes solicitudes de reserva.</Notice>
            ) : null}
            {history.map((item) => (
              <View
                key={item.requestId}
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 12,
                  padding: 14,
                  gap: 6,
                }}
              >
                <Text style={{ color: colors.foreground, fontWeight: "800" }}>
                  {item.requestedAt
                    ? formatDate(item.requestedAt)
                    : "Horario no disponible"}
                </Text>
                <Text style={ui.body}>
                  {item.guests
                    ? `${item.guests} ${item.guests === 1 ? "persona" : "personas"}`
                    : "Tamaño de grupo no disponible"}
                </Text>
                <StatusChip
                  label={decisionLabel(item.decision, item.reservationStatus)}
                  tone={
                    item.reservationStatus === "CONFIRMED"
                      ? "success"
                      : item.decision === "REJECT"
                        ? "error"
                        : "warning"
                  }
                />
                <Text style={ui.body}>{item.message}</Text>
                {item.reservationStatus === "REQUESTED" &&
                item.reservationId ? (
                  <>
                    <Notice>
                      Esta solicitud aún espera revisión. Sólo se pueden
                      cancelar solicitudes pendientes; las reservas confirmadas
                      requieren contactar al restaurante.
                    </Notice>
                    <Button
                      title="Cancelar solicitud pendiente"
                      secondary
                      busy={cancellingReservationId === item.reservationId}
                      disabled={Boolean(cancellingReservationId)}
                      onPress={() =>
                        item.reservationId
                          ? void cancelRequest(item.reservationId)
                          : undefined
                      }
                    />
                  </>
                ) : null}
              </View>
            ))}
            <Button
              title="Actualizar solicitudes"
              secondary
              busy={historyLoading}
              onPress={() => void refreshHistory()}
            />
          </Card>
        ) : null}
        {!session ? (
          <Notice>
            Necesitas una cuenta Cliente verificada. Puedes crearla desde Mi
            cuenta.
          </Notice>
        ) : null}
      </Page>
    </ScrollView>
  );
}

type ReservationDraft = {
  ownerEmail: string;
  guests: string;
  requestedAt: string;
  notes: string;
  preorder: boolean;
  savedAt: number;
};

const reservationDraftKey = "wok.client.reservation-draft.v1";
const reservationDraftLifetimeMs = 30 * 24 * 60 * 60 * 1000;

function parseReservationDraft(raw: string): ReservationDraft | null {
  if (raw.length > 1800) return null;
  try {
    const value = JSON.parse(raw) as Partial<ReservationDraft>;
    if (
      typeof value.ownerEmail !== "string" ||
      typeof value.guests !== "string" ||
      typeof value.requestedAt !== "string" ||
      typeof value.notes !== "string" ||
      typeof value.preorder !== "boolean" ||
      typeof value.savedAt !== "number"
    )
      return null;
    return value as ReservationDraft;
  } catch {
    return null;
  }
}

function hasReservationDraft(
  guests: string,
  requestedAt: string,
  notes: string,
  preorder: boolean,
) {
  return (
    guests !== "2" || requestedAt.length > 0 || notes.length > 0 || preorder
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Horario no disponible"
    : date.toLocaleString("es-GT", { dateStyle: "medium", timeStyle: "short" });
}

function decisionLabel(
  decision: ReservationResult["decision"],
  status?: string | null,
) {
  if (status === "CONFIRMED") return "Reserva confirmada";
  if (status === "ARRIVED") return "Llegada registrada";
  if (status === "SEATED") return "En mesa";
  if (status === "CANCELLED") return "Reserva cancelada";
  if (status === "COMPLETED") return "Visita completada";
  if (status === "NO_SHOW") return "Visita no realizada";
  if (status === "REQUESTED") return "Pendiente de revisión";
  if (decision === "SUGGEST_OTHER_TIME") return "Prueba otro horario";
  if (decision === "REJECT") return "No disponible";
  if (decision === "ACCEPT" || decision === "ACCEPT_WITH_CONDITIONS")
    return "Pendiente de confirmación";
  return "En revisión por el equipo";
}

function createRequestKey() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    (character) => {
      const random = Math.floor(Math.random() * 16);
      return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
    },
  );
}
