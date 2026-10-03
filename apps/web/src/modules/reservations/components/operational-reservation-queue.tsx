"use client";

import { useState } from "react";
import { CalendarDays, Check, UsersRound, X } from "lucide-react";
import { usePickupResource } from "@/modules/client-order-tracking/use-pickup-resource";
import {
  isOperationalPendingReservations,
  type OperationalPendingReservation,
  type OperationalReservationDecision,
} from "../live-contract";
import styles from "./reservations.module.css";

type DecisionDraft = OperationalReservationDecision & { reservationId: string };

function decisionLabel(decision: OperationalReservationDecision["decision"]) {
  return decision === "CONFIRM" ? "Confirmar solicitud" : "Rechazar solicitud";
}

function formatReservationDate(value: string) {
  return new Intl.DateTimeFormat("es-GT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function OperationalReservationQueue() {
  const queue = usePickupResource(
    "/bff/operational/reservations/pending",
    isOperationalPendingReservations,
  );
  const [draft, setDraft] = useState<DecisionDraft | null>(null);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  function beginDecision(
    reservation: OperationalPendingReservation,
    decision: OperationalReservationDecision["decision"],
  ) {
    setError("");
    setFeedback("");
    setDraft({
      reservationId: reservation.id,
      decision,
      reason: "",
      expectedVersion: reservation.rowVersion,
    });
  }

  async function submitDecision() {
    if (!draft || sending) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch(
        `/bff/operational/reservations/${draft.reservationId}/decision`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Request-Id": crypto.randomUUID(),
          },
          body: JSON.stringify({
            decision: draft.decision,
            reason: draft.reason.trim(),
            expectedVersion: draft.expectedVersion,
          }),
        },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          body &&
          typeof body === "object" &&
          "message" in body &&
          typeof body.message === "string"
            ? body.message
            : "No pudimos guardar la decisión.";
        if (response.status === 409) {
          setError(
            "La solicitud cambió mientras la revisabas. Actualizamos la cola para no sobrescribir otra decisión.",
          );
          setDraft(null);
          queue.reload();
          return;
        }
        throw new Error(message);
      }
      setFeedback(
        draft.decision === "CONFIRM"
          ? "Solicitud confirmada."
          : "Solicitud rechazada.",
      );
      setDraft(null);
      queue.reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos guardar la decisión.",
      );
    } finally {
      setSending(false);
    }
  }

  const validReason = !!draft && draft.reason.trim().length >= 3;
  const visibleError = error || queue.error?.message;

  return (
    <div className={styles.page}>
      <header className="ops-page-header">
        <div>
          <span className="ops-kicker">Solicitudes pendientes</span>
          <h1>Reservaciones</h1>
          <p>Revisa y decide las solicitudes recibidas del portal Cliente.</p>
        </div>
      </header>

      {feedback ? <p role="status">{feedback}</p> : null}
      {visibleError ? (
        <div role="alert">
          <p>{visibleError}</p>
          <button
            className="button button--secondary"
            disabled={sending}
            onClick={queue.reload}
            type="button"
          >
            Actualizar cola
          </button>
        </div>
      ) : null}

      {!queue.data && !queue.error ? (
        <div className={styles.empty} role="status">
          <CalendarDays aria-hidden="true" size={25} />
          <strong>Cargando solicitudes pendientes…</strong>
        </div>
      ) : queue.error ? null : queue.data?.length === 0 ? (
        <div className={styles.empty}>
          <CalendarDays aria-hidden="true" size={25} />
          <strong>No hay solicitudes pendientes</strong>
          <span>Las nuevas solicitudes de Cliente aparecerán aquí­.</span>
        </div>
      ) : (
        <section className={styles.list} aria-label="Solicitudes pendientes">
          {queue.data?.map((reservation) => {
            const active = draft?.reservationId === reservation.id;
            return (
              <article className={styles.row} key={reservation.id}>
                <div className={styles.time}>
                  <CalendarDays aria-hidden="true" size={17} />
                  <strong>
                    {formatReservationDate(reservation.reservationAt)}
                  </strong>
                </div>
                <div className={styles.guest}>
                  <strong>{reservation.customerName}</strong>
                  <span>{reservation.email ?? "Sin correo registrado"}</span>
                  {reservation.notes ? (
                    <small>{reservation.notes}</small>
                  ) : null}
                </div>
                <div className={styles.people}>
                  <UsersRound aria-hidden="true" size={16} />
                  <span>{reservation.guests} personas</span>
                </div>
                <div className={styles.queueActions}>
                  <button
                    className="button button--primary button--compact"
                    disabled={sending}
                    onClick={() => beginDecision(reservation, "CONFIRM")}
                    type="button"
                  >
                    <Check aria-hidden="true" size={16} /> Confirmar
                  </button>
                  <button
                    className="button button--secondary button--compact"
                    disabled={sending}
                    onClick={() => beginDecision(reservation, "REJECT")}
                    type="button"
                  >
                    <X aria-hidden="true" size={16} /> Rechazar
                  </button>
                </div>
                {active ? (
                  <div className={styles.queueDecision}>
                    <label className="order-field">
                      <span>Motivo de la decisión</span>
                      <textarea
                        disabled={sending}
                        maxLength={500}
                        minLength={3}
                        onChange={(event) =>
                          setDraft((current) =>
                            current
                              ? { ...current, reason: event.target.value }
                              : current,
                          )
                        }
                        required
                        rows={3}
                        value={draft.reason}
                      />
                    </label>
                    <div className={styles.queueActions}>
                      <button
                        className="button button--primary button--compact"
                        disabled={sending || !validReason}
                        onClick={() => void submitDecision()}
                        type="button"
                      >
                        {sending
                          ? "Guardando…"
                          : decisionLabel(draft.decision)}
                      </button>
                      <button
                        className="button button--secondary button--compact"
                        disabled={sending}
                        onClick={() => setDraft(null)}
                        type="button"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
