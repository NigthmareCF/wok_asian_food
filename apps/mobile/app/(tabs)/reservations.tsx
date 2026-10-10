import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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
import {
  isDefinitiveReservationRejection,
  reservationAcknowledgement,
  type ReservationAttempt,
} from "@/lib/reservation-attempt";
import { useSession } from "@/providers/session-provider";
import {
  restaurantInstant,
  reservationTimeError,
  reservationPolicySchema,
  type ReservationPolicy,
} from "@/lib/slot-time";

export default function ReservationsScreen() {
  const { session } = useSession();
  const owner = session?.email.trim().toLowerCase() ?? "";
  return (
    <ReservationForm
      key={`${owner}:${session?.version ?? "signed-out"}`}
      owner={owner}
    />
  );
}

function ReservationForm({ owner }: { owner: string }) {
  const { colors, ui } = useUiTheme();
  const { session, request } = useSession();
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
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
  const pendingRequest = useRef<ReservationAttempt | null>(null);
  const submitting = useRef(false);
  const uncertain = useRef(false);
  const draftGeneration = useRef(0);
  const [draftEpoch, setDraftEpoch] = useState(0);
  const [attemptPending, setAttemptPending] = useState(false);
  const draftLocked = busy || attemptPending;
  const [policy, setPolicy] = useState<{
    owner: string;
    value: ReservationPolicy;
  } | null>(null);
  const [policyError, setPolicyError] = useState("");
  const [policyRefresh, setPolicyRefresh] = useState(0);
  const currentPolicy = policy?.owner === owner ? policy?.value : undefined;

  useEffect(() => {
    let active = true;
    if (!session) return;
    void request<unknown>("/api/v1/client/reservations/policy")
      .then((result) => {
        const value = reservationPolicySchema.parse(result);
        if (active && mounted.current) {
          setPolicy({ owner, value });
          setPolicyError("");
        }
      })
      .catch(() => {
        if (active && mounted.current)
          setPolicyError(
            "No pudimos consultar la política de solicitudes. Actualiza antes de enviar.",
          );
      });
    return () => {
      active = false;
    };
  }, [request, session, owner, policyRefresh]);

  useEffect(() => {
    let active = true;
    if (!owner)
      return () => {
        active = false;
      };
    void queueReservationDraftOperation(async () => {
      if (!active || !mounted.current) return;
      if (Platform.OS !== "web") {
        const raw = await SecureStore.getItemAsync(reservationDraftKey);
        if (!active || !mounted.current) return;
        if (raw) {
          const draft = parseReservationDraft(raw);
          if (
            draft &&
            draft.ownerEmail.trim().toLowerCase() === owner &&
            Date.now() - draft.savedAt < reservationDraftLifetimeMs
          ) {
            if (active && !submitting.current && !pendingRequest.current) {
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
        if (active && mounted.current)
          setDraftError(
            "No se pudo leer el borrador guardado en este dispositivo.",
          );
      })
      .finally(() => {
        if (active && mounted.current) setDraftReady(true);
      });
    return () => {
      active = false;
    };
  }, [owner]);

  useEffect(() => {
    if (
      !owner ||
      !draftReady ||
      Platform.OS === "web" ||
      !hasReservationDraft(guests, requestedAt, notes, preorder)
    )
      return;
    const draft: ReservationDraft = {
      ownerEmail: owner,
      guests,
      requestedAt,
      notes,
      preorder,
      savedAt: Date.now(),
    };
    let active = true;
    const generation = draftGeneration.current;
    const isCurrentDraft = () =>
      active && mounted.current && generation === draftGeneration.current;
    const timer = setTimeout(() => {
      void queueReservationDraftOperation(async () => {
        if (isCurrentDraft())
          await SecureStore.setItemAsync(
            reservationDraftKey,
            JSON.stringify(draft),
          );
      })
        .then(() => {
          if (isCurrentDraft()) setDraftError("");
        })
        .catch(() => {
          if (isCurrentDraft())
            setDraftError(
              "No se pudo guardar el borrador en este dispositivo.",
            );
        });
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [owner, draftReady, guests, requestedAt, notes, preorder]);

  const refreshHistory = useCallback(async () => {
    if (!mounted.current) return;
    if (!session) {
      setHistory([]);
      return;
    }
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const result = await request<ReservationHistoryItem[]>(
        "/api/v1/client/reservations",
      );
      if (mounted.current) setHistory(result);
    } catch (e) {
      if (mounted.current)
        setHistoryError(
          e instanceof Error ? e.message : "No se pudo cargar tu historial.",
        );
    } finally {
      if (mounted.current) setHistoryLoading(false);
    }
  }, [request, session]);

  useEffect(() => {
    void Promise.resolve().then(refreshHistory);
  }, [refreshHistory]);

  async function submit() {
    if (
      !mounted.current ||
      submitting.current ||
      draftEpoch !== draftGeneration.current
    )
      return;
    // This barrier precedes React updates and transport, including reentrant calls.
    submitting.current = true;
    try {
      setError("");
      setMessage("");
      if (!session) {
        setError("Inicia sesión desde Mi cuenta para enviar una solicitud.");
        return;
      }
      let attempt = pendingRequest.current;
      if (
        attempt &&
        (attempt.owner !== owner || attempt.sessionVersion !== session.version)
      ) {
        setError("Inicia una nueva sesión antes de enviar una solicitud.");
        return;
      }
      if (!attempt) {
        const instant = restaurantInstant(requestedAt);
        const count = Number(guests);
        if (!Number.isInteger(count) || count < 1 || count > 50) {
          setError("Indica entre 1 y 50 personas.");
          return;
        }
        if (!instant) {
          setError("Indica una fecha y hora válidas.");
          return;
        }
        if (!currentPolicy) {
          setError("Consulta la política de solicitudes antes de enviar.");
          return;
        }
        const timeError = reservationTimeError(
          requestedAt,
          Date.now(),
          currentPolicy,
        );
        if (timeError) {
          setError(timeError);
          return;
        }
        attempt = Object.freeze({
          owner,
          sessionVersion: session.version,
          body: JSON.stringify({
            guests: count,
            requestedAt: instant,
            preorder,
            notes: notes.trim() || null,
          }),
          key: createRequestKey(),
        });
        pendingRequest.current = attempt;
        uncertain.current = false;
      }
      setAttemptPending(true);
      setBusy(true);
      const acknowledgement = await request<unknown>(
        "/api/v1/client/reservations",
        {
          method: "POST",
          headers: { "Idempotency-Key": attempt.key },
          body: attempt.body,
        },
      );
      if (!mounted.current) return;
      const result = reservationAcknowledgement(acknowledgement, attempt);
      if (!result)
        throw new Error(
          "No pudimos validar el resultado. Reintenta la misma solicitud.",
        );
      pendingRequest.current = null;
      uncertain.current = false;
      setAttemptPending(false);
      if (result.submitted) {
        // Invalidate queued saves before native cleanup or React's next render.
        draftGeneration.current++;
        setDraftEpoch(draftGeneration.current);
        if (Platform.OS !== "web") {
          try {
            await queueReservationDraftOperation(async () => {
              if (mounted.current)
                await SecureStore.deleteItemAsync(reservationDraftKey);
            });
          } catch {
            if (mounted.current)
              setDraftError(
                "La solicitud se envió, pero no pudimos borrar el borrador local.",
              );
          }
        }
        if (!mounted.current) return;
        setDraftRestored(false);
        setGuests("2");
        setRequestedAt("");
        setNotes("");
        setPreorder(false);
      }
      setMessageTone(result.submitted ? "success" : "info");
      setMessage(
        result.message ||
          (result.submitted
            ? "Solicitud enviada; el equipo debe revisarla y confirmarla."
            : `La solicitud no fue aceptada automáticamente (${result.decision}).`),
      );
      void refreshHistory();
    } catch (e) {
      if (mounted.current) {
        if (!uncertain.current && isDefinitiveReservationRejection(e)) {
          pendingRequest.current = null;
          setAttemptPending(false);
        } else if (pendingRequest.current) {
          uncertain.current = true;
        }
        setError(
          e instanceof Error ? e.message : "No se pudo enviar la solicitud.",
        );
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function changeDraft(update: () => void) {
    if (!mounted.current || submitting.current || pendingRequest.current)
      return;
    update();
  }

  async function cancelRequest(reservationId: string) {
    if (!mounted.current) return;
    setCancellingReservationId(reservationId);
    setCancellationError("");
    setCancellationNotice("");
    try {
      await request<{ reservationId: string; status: string }>(
        `/api/v1/client/reservations/${reservationId}`,
        { method: "DELETE" },
      );
      if (!mounted.current) return;
      setCancellationNotice("Cancelamos tu solicitud pendiente.");
      await refreshHistory();
    } catch (cause) {
      if (mounted.current)
        setCancellationError(
          cause instanceof Error
            ? cause.message
            : "No pudimos cancelar la solicitud.",
        );
    } finally {
      if (mounted.current) setCancellingReservationId(null);
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
            onChange={(value) => changeDraft(() => setRequestedAt(value))}
            disabled={draftLocked}
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
              disabled={draftLocked || Number(guests) <= 1}
              onPress={() =>
                changeDraft(() => setGuests(stepGuests(guests, -1)))
              }
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
              disabled={draftLocked || Number(guests) >= 50}
              onPress={() =>
                changeDraft(() => setGuests(stepGuests(guests, 1)))
              }
            />
          </View>
          <Text className="font-sans text-xs text-muted-foreground">
            De 1 a 50 personas por solicitud.
          </Text>
          <Field
            label="Solicitudes especiales (opcional)"
            value={notes}
            onChangeText={(value) => changeDraft(() => setNotes(value))}
            editable={!draftLocked}
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
            disabled={draftLocked}
            onPress={() => changeDraft(() => setPreorder(!preorder))}
          />
          {preorder ? (
            <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
              Esto avisa al equipo para evaluar la solicitud; aún no agrega
              productos.
            </Text>
          ) : null}
          {error ? <Notice tone="error">{error}</Notice> : null}
          {message ? <Notice tone={messageTone}>{message}</Notice> : null}
          {attemptPending && !busy ? (
            <Notice>
              El resultado aún no está confirmado. Reintenta la misma solicitud
              con los mismos datos antes de crear otra.
            </Notice>
          ) : null}
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
            title={
              attemptPending && !busy
                ? "Reintentar la misma solicitud"
                : "Enviar solicitud de reserva"
            }
            busy={busy}
            disabled={busy}
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

// A native operation already in flight cannot be cancelled. Keep reads/writes/
// deletes ordered across session remounts so old I/O cannot overtake new drafts.
let reservationDraftOperations: Promise<unknown> = Promise.resolve();
function queueReservationDraftOperation<T>(operation: () => Promise<T>) {
  const next = reservationDraftOperations.then(operation);
  reservationDraftOperations = next.catch(() => undefined);
  return next;
}

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
