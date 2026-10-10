"use client";

import Link from "next/link";
import { Clock3, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useClientSession } from "@/modules/clients/client-session-provider";
import {
  localDate,
  type ReservationDraft,
} from "@/modules/clients/client-session";
import {
  isLateReservation,
  validateReservation,
  type ReservationErrors,
} from "../client-reservation";
import { clientReservationFixture } from "@/data/fixtures/client-reservations";
import { Button } from "@/shared/components/ui/button";
import { FormField } from "@/shared/components/ui/form-field";
import { StatusBadge } from "@/shared/components/ui/status-badge";
import styles from "./reservation.module.css";

const subscribeDate = () => () => {};
const getDateSnapshot = () => localDate(new Date());

export function ReservationFormView({ initialTime }: { initialTime?: string }) {
  const session = useClientSession();
  const today = useSyncExternalStore(subscribeDate, getDateSnapshot, () => "");
  const draft: ReservationDraft = session.reservationDraft ?? {
    date: today,
    time: initialTime ?? clientReservationFixture.defaultTime,
    people: clientReservationFixture.defaultPeople,
    includesPreorder: null,
    note: "",
    serviceTime: "",
  };
  const { date, time, people, includesPreorder, note, serviceTime } = draft;
  const updateDraft = (changes: Partial<ReservationDraft>) =>
    session.updateReservation({ ...draft, ...changes });
  const setDate = (value: string) => updateDraft({ date: value });
  const setTime = (value: string) => updateDraft({ time: value });
  const setIncludesPreorder = (value: boolean) =>
    updateDraft({ includesPreorder: value });
  const setNote = (value: string) => updateDraft({ note: value });
  const setServiceTime = (value: string) => updateDraft({ serviceTime: value });
  const [errors, setErrors] = useState<ReservationErrors>({});
  const isPendingConfirmation = Boolean(session.reservation);
  const [isLateNoticeDismissed, setIsLateNoticeDismissed] = useState(false);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (isPendingConfirmation) summaryRef.current?.focus();
  }, [isPendingConfirmation]);
  const lateReservation = isLateReservation(time);
  const showLateNotice = lateReservation && !isLateNoticeDismissed;

  function updatePeople(amount: number) {
    if (Number.isSafeInteger(people + amount))
      updateDraft({ people: Math.max(1, people + amount) });
    setErrors((current) => ({ ...current, people: undefined }));
  }

  function useLastNormalTime() {
    updateDraft({
      time: clientReservationFixture.lastNormalEntryTime,
    });
    setIsLateNoticeDismissed(false);
    setErrors((current) => ({
      ...current,
      preorder: undefined,
      time: undefined,
    }));
  }

  function chooseOtherTime() {
    setIsLateNoticeDismissed(true);
    timeInputRef.current?.focus();
  }

  function submitReservation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (session.reservation) return;
    const nextErrors = validateReservation(draft);

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      document
        .getElementById(
          nextErrors.date
            ? "reservation-date"
            : nextErrors.time
              ? "reservation-time"
              : nextErrors.serviceTime
                ? "service-time"
                : "preorder-choice",
        )
        ?.focus();
      return;
    }
    session.saveReservation(draft);
  }

  return (
    <section className={styles.reservation} aria-labelledby="reservation-title">
      <Link className="button button--secondary" href="/client">
        Volver al inicio de Cliente
      </Link>
      <header className={styles.header}>
        <div>
          <span className={styles.kicker}>RESERVA</span>
          <h1 id="reservation-title">Crear reservación</h1>
        </div>
        <StatusBadge
          label={clientReservationFixture.availability.label}
          tone={clientReservationFixture.availability.tone}
        />
      </header>

      <p className={styles.simulationNotice}>
        Guardado solamente durante esta sesión. La disponibilidad se verificará
        antes de confirmar; esta solicitud no confirma una mesa.
      </p>

      {isPendingConfirmation ? (
        <section
          className={styles.pendingCard}
          aria-live="polite"
          role="status"
        >
          <Clock3 aria-hidden="true" size={28} />
          <div>
            <h2 ref={summaryRef} tabIndex={-1}>
              Solicitud de reserva pendiente de validación
            </h2>
            <p>
              Guardada localmente; todavía no enviada. Sujeta a disponibilidad y
              validación del restaurante, que decide su aceptación.
            </p>
          </div>
          <dl>
            <dt>Fecha y hora</dt>
            <dd>
              {session.reservation?.date} · {session.reservation?.time}
            </dd>
            <dt>Personas</dt>
            <dd>{session.reservation?.people}</dd>
            <dt>Preorden</dt>
            <dd>
              {session.reservation?.includesPreorder
                ? "Solicitada; productos pendientes de vincular"
                : "Sin preorden"}
            </dd>
            {session.reservation?.serviceTime ? (
              <>
                <dt>Hora objetivo</dt>
                <dd>{session.reservation.serviceTime}</dd>
              </>
            ) : null}
            {session.reservation?.note ? (
              <>
                <dt>Nota</dt>
                <dd>{session.reservation.note}</dd>
              </>
            ) : null}
          </dl>
          <Button onClick={() => updateDraft({})} variant="secondary">
            Revisar solicitud
          </Button>
        </section>
      ) : null}

      {!isPendingConfirmation ? (
        <form className={styles.form} noValidate onSubmit={submitReservation}>
          <section className={styles.group} aria-labelledby="date-time-title">
            <h2 className="sr-only" id="date-time-title">
              Fecha y hora
            </h2>
            <div className={styles.dateTimeGrid}>
              <FormField
                error={errors.date}
                required
                min={today}
                className={styles.control}
                id="reservation-date"
                label="FECHA"
                onChange={(event) => {
                  setDate(event.target.value);
                  setErrors((current) => ({ ...current, date: undefined }));
                }}
                type="date"
                value={date}
              />
              <label className={styles.field} htmlFor="reservation-time">
                <span>HORA</span>
                <input
                  aria-describedby={
                    errors.time ? "reservation-time-error" : undefined
                  }
                  aria-invalid={Boolean(errors.time)}
                  className={styles.control}
                  id="reservation-time"
                  onChange={(event) => {
                    setTime(event.target.value);
                    setIsLateNoticeDismissed(false);
                    setErrors((current) => ({
                      ...current,
                      preorder: undefined,
                      time: undefined,
                    }));
                  }}
                  ref={timeInputRef}
                  type="time"
                  required
                  value={time}
                />
                {errors.time ? (
                  <small className={styles.error} id="reservation-time-error">
                    {errors.time}
                  </small>
                ) : null}
              </label>
            </div>
          </section>

          {showLateNotice ? (
            <LateReservationNotice
              onChooseOtherTime={chooseOtherTime}
              onUseLastNormalTime={useLastNormalTime}
            />
          ) : null}

          <section className={styles.group} aria-labelledby="people-title">
            <h2 id="people-title">NÚMERO DE PERSONAS</h2>
            <div className={styles.peopleControl}>
              <button
                aria-label="Reducir número de personas"
                disabled={people <= 1}
                onClick={() => updatePeople(-1)}
                type="button"
              >
                <Minus aria-hidden="true" size={18} />
              </button>
              <output aria-live="polite">{people}</output>
              <button
                aria-label="Aumentar número de personas"
                onClick={() => updatePeople(1)}
                type="button"
              >
                <Plus aria-hidden="true" size={18} />
              </button>
            </div>
            {errors.people ? (
              <p className={styles.error}>{errors.people}</p>
            ) : null}
          </section>

          <fieldset className={styles.group}>
            <legend>¿INCLUIR PREORDEN?</legend>
            <p className={styles.help} id="preorder-help">
              Al elegir Sí podrás seleccionar platillos en el menú. Tu borrador
              se conserva; vuelve desde Inicio de cliente → Reservas. Los
              productos todavía no se vinculan a esta solicitud.
            </p>
            <div className={styles.choiceGrid}>
              <Link
                aria-describedby="preorder-help"
                className={includesPreorder === true ? styles.selected : ""}
                href="/client/menu"
                id="preorder-choice"
                onClick={() => setIncludesPreorder(true)}
              >
                Sí
              </Link>
              <button
                aria-pressed={includesPreorder === false}
                className={includesPreorder === false ? styles.selected : ""}
                onClick={() => setIncludesPreorder(false)}
                type="button"
              >
                Ahora no
              </button>
            </div>
            {lateReservation ? (
              <p className={styles.requiredPreorder}>
                La solicitud tardía requiere preorden para la validación del
                restaurante. Puedes registrar la solicitud aunque esté
                pendiente; incluirla no garantiza aceptación.
              </p>
            ) : null}
            {errors.preorder ? (
              <p className={styles.error} role="alert">
                {errors.preorder}
              </p>
            ) : null}
          </fieldset>

          <section
            className={styles.group}
            aria-labelledby="service-time-title"
          >
            <div className={styles.optionalHeading}>
              <h2 id="service-time-title">HORA OBJETIVO DE SERVICIO</h2>
              <span>Opcional</span>
            </div>
            <input
              aria-describedby="service-time-help"
              className={styles.control}
              id="service-time"
              aria-labelledby="service-time-title"
              aria-invalid={Boolean(errors.serviceTime)}
              onChange={(event) => setServiceTime(event.target.value)}
              type="time"
              value={serviceTime}
            />
            <p className={styles.help} id="service-time-help">
              Indica cuándo deseas que inicie el servicio en mesa.
            </p>
            {errors.serviceTime ? (
              <p className={styles.error} role="alert">
                {errors.serviceTime}
              </p>
            ) : null}
          </section>

          <section className={styles.group} aria-labelledby="note-title">
            <h2 id="note-title">NOTA ESPECIAL</h2>
            <textarea
              className={styles.control}
              id="reservation-note"
              aria-labelledby="note-title"
              onChange={(event) => setNote(event.target.value)}
              placeholder="Alergias, celebraciones, preferencias..."
              rows={3}
              value={note}
            />
          </section>

          <Button fullWidth type="submit" disabled={!today}>
            CONTINUAR
          </Button>
        </form>
      ) : null}
    </section>
  );
}

function LateReservationNotice({
  onChooseOtherTime,
  onUseLastNormalTime,
}: {
  onChooseOtherTime: () => void;
  onUseLastNormalTime: () => void;
}) {
  return (
    <section
      className={styles.lateNotice}
      aria-labelledby="late-reservation-title"
    >
      <Clock3 aria-hidden="true" className={styles.lateNoticeIcon} size={28} />
      <div className={styles.lateNoticeContent}>
        <div className={styles.warningBlock}>
          <h2 id="late-reservation-title">
            Solicitud tardía: después de las <strong>21:15</strong>.
          </h2>
          <p>
            Las solicitudes tardías están sujetas a disponibilidad y validación
            del restaurante. Registrar la solicitud no garantiza su aceptación.
          </p>
        </div>
        <div className={styles.conditionBlock}>
          <h2>Validación pendiente</h2>
          <p>
            Las 21:15 son una referencia para el aviso de solicitud tardía, no
            una garantía de disponibilidad.
          </p>
        </div>
      </div>
      <Button fullWidth onClick={onUseLastNormalTime} type="button">
        USAR 21:15
      </Button>
      <Button
        fullWidth
        onClick={onChooseOtherTime}
        type="button"
        variant="secondary"
      >
        ELEGIR OTRA HORA
      </Button>
    </section>
  );
}
