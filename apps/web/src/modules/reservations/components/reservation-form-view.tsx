"use client";

import { Clock3, Minus, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { clientReservationFixture } from "@/data/fixtures/client-reservations";
import { Button } from "@/shared/components/ui/button";
import { FormField } from "@/shared/components/ui/form-field";
import { StatusBadge } from "@/shared/components/ui/status-badge";
import styles from "./reservation.module.css";

type ReservationErrors = Partial<{
  date: string;
  people: string;
  preorder: string;
  time: string;
}>;

function getTimeInMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;

  return hour * 60 + minute;
}

function isLateReservation(time: string) {
  const selectedTime = getTimeInMinutes(time);
  const lastNormalTime = getTimeInMinutes(
    clientReservationFixture.lastNormalEntryTime,
  );

  return (
    selectedTime !== null &&
    lastNormalTime !== null &&
    selectedTime > lastNormalTime
  );
}

export function ReservationFormView() {
  const [date, setDate] = useState(clientReservationFixture.defaultDate);
  const [time, setTime] = useState(clientReservationFixture.defaultTime);
  const [people, setPeople] = useState(clientReservationFixture.defaultPeople);
  const [includesPreorder, setIncludesPreorder] = useState<boolean | null>(
    null,
  );
  const [note, setNote] = useState("");
  const [serviceTime, setServiceTime] = useState("");
  const [errors, setErrors] = useState<ReservationErrors>({});
  const [isPendingConfirmation, setIsPendingConfirmation] = useState(false);
  const [isLateNoticeDismissed, setIsLateNoticeDismissed] = useState(false);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const lateReservation = isLateReservation(time);
  const showLateNotice = lateReservation && !isLateNoticeDismissed;

  function updatePeople(amount: number) {
    setPeople((current) => Math.max(1, current + amount));
    setErrors((current) => ({ ...current, people: undefined }));
  }

  function useLastNormalTime() {
    setTime(clientReservationFixture.lastNormalEntryTime);
    setIncludesPreorder(true);
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
    const nextErrors: ReservationErrors = {};

    if (!date) nextErrors.date = "Selecciona una fecha.";
    if (!time) nextErrors.time = "Selecciona una hora.";
    if (people < 1) nextErrors.people = "Selecciona al menos una persona.";
    if (includesPreorder === null) {
      nextErrors.preorder = "Indica si deseas incluir preorden.";
    }
    if (lateReservation && includesPreorder !== true) {
      nextErrors.preorder =
        "Después de las 21:15 se requiere preorden completa.";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsPendingConfirmation(true);
  }

  return (
    <section className={styles.reservation} aria-labelledby="reservation-title">
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
        Datos de disponibilidad simulados. La solicitud no confirma una mesa.
      </p>

      {isPendingConfirmation ? (
        <section
          className={styles.pendingCard}
          aria-live="polite"
          role="status"
        >
          <Clock3 aria-hidden="true" size={28} />
          <div>
            <h2>Solicitud pendiente de confirmación</h2>
            <p>
              Esta es una simulación. La reservación no fue enviada ni
              confirmada por el restaurante.
            </p>
          </div>
          <Button
            onClick={() => setIsPendingConfirmation(false)}
            variant="secondary"
          >
            Revisar solicitud
          </Button>
        </section>
      ) : null}

      <form className={styles.form} noValidate onSubmit={submitReservation}>
        <section className={styles.group} aria-labelledby="date-time-title">
          <h2 className="sr-only" id="date-time-title">
            Fecha y hora
          </h2>
          <div className={styles.dateTimeGrid}>
            <FormField
              aria-invalid={Boolean(errors.date)}
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
          <div className={styles.choiceGrid}>
            <button
              aria-pressed={includesPreorder === true}
              className={includesPreorder === true ? styles.selected : ""}
              onClick={() => {
                setIncludesPreorder(true);
                setErrors((current) => ({ ...current, preorder: undefined }));
              }}
              type="button"
            >
              Sí
            </button>
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
              El preorden es obligatorio para esta hora.
            </p>
          ) : null}
          {errors.preorder ? (
            <p className={styles.error} role="alert">
              {errors.preorder}
            </p>
          ) : null}
        </fieldset>

        <section className={styles.group} aria-labelledby="service-time-title">
          <div className={styles.optionalHeading}>
            <h2 id="service-time-title">HORA OBJETIVO DE SERVICIO</h2>
            <span>Opcional</span>
          </div>
          <input
            aria-describedby="service-time-help"
            className={styles.control}
            id="service-time"
            onChange={(event) => setServiceTime(event.target.value)}
            type="time"
            value={serviceTime}
          />
          <p className={styles.help} id="service-time-help">
            Indica cuándo deseas que inicie el servicio en mesa.
          </p>
        </section>

        <section className={styles.group} aria-labelledby="note-title">
          <h2 id="note-title">NOTA ESPECIAL</h2>
          <textarea
            className={styles.control}
            id="reservation-note"
            onChange={(event) => setNote(event.target.value)}
            placeholder="Alergias, celebraciones, preferencias..."
            rows={3}
            value={note}
          />
        </section>

        <Button fullWidth type="submit">
          CONTINUAR
        </Button>
      </form>
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
            La última hora disponible para ingreso es <strong>21:15</strong>.
          </h2>
          <p>
            Para esta hora se requiere preorden completa y confirmación del
            restaurante.
          </p>
        </div>
        <div className={styles.conditionBlock}>
          <h2>Condición requerida</h2>
          <p>El preorden queda marcado como obligatorio al usar 21:15.</p>
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
