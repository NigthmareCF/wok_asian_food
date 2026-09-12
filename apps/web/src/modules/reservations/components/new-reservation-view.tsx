"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarCheck,
  CircleAlert,
  Clock3,
  UsersRound,
} from "lucide-react";
import { operationalTables } from "@/data/fixtures/operation";
import type { ReservationSource } from "@/data/fixtures/reservations";
import { useTableSession } from "@/modules/tables";
import { useReservationSession } from "../reservation-session-provider";
import styles from "./reservations.module.css";

const timeToMinutes = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

export function NewReservationView() {
  const router = useRouter();
  const { reservations, createReservation } = useReservationSession();
  const { updateTable } = useTableSession();
  const [guest, setGuest] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState("2026-09-11");
  const [time, setTime] = useState("14:00");
  const [people, setPeople] = useState(2);
  const [tableNumber, setTableNumber] = useState("");
  const [source, setSource] = useState<ReservationSource>("phone");
  const [preorder, setPreorder] = useState(false);
  const [note, setNote] = useState("");
  const [humanConfirmed, setHumanConfirmed] = useState(false);

  const compatibleTables = useMemo(
    () =>
      operationalTables
        .filter(
          (table) =>
            table.capacity >= people && table.status !== "out-of-service",
        )
        .sort((a, b) => a.capacity - b.capacity || a.number - b.number),
    [people],
  );

  const selectedTableNumber = Number(tableNumber);
  const conflict = reservations.find(
    (reservation) =>
      reservation.date === date &&
      reservation.tableNumber === selectedTableNumber &&
      reservation.status !== "expired" &&
      Math.abs(timeToMinutes(reservation.time) - timeToMinutes(time)) < 90,
  );
  const isLate = timeToMinutes(time) > timeToMinutes("21:15");
  const canSave =
    guest.trim().length >= 2 &&
    phone.trim().length >= 8 &&
    Boolean(date && time && tableNumber) &&
    people > 0 &&
    !conflict &&
    (!isLate || preorder) &&
    humanConfirmed;

  const saveReservation = () => {
    if (!canSave) return;
    const id = createReservation({
      date,
      guest: guest.trim(),
      note: note.trim() || undefined,
      people,
      phone: phone.trim(),
      preorder,
      source,
      status: preorder ? "preorder" : "confirmed",
      tableNumber: selectedTableNumber,
      time,
    });

    if (date === "2026-09-11") {
      const table = operationalTables.find(
        (item) => item.number === selectedTableNumber,
      );
      if (table) {
        updateTable(table.id, (current) => ({
          ...current,
          status: current.status === "free" ? "reserved" : current.status,
          nextReservation: { guest: guest.trim(), people, time },
        }));
      }
    }
    router.push(`/operation/reservations/${id}`);
  };

  return (
    <div className={styles.page}>
      <header className={`ops-page-header ${styles.header}`}>
        <div>
          <Link className="text-action" href="/operation/reservations">
            <ArrowLeft aria-hidden="true" size={16} /> Volver a reservaciones
          </Link>
          <span className="ops-kicker">Agenda operativa</span>
          <h1>Nueva reservación</h1>
          <p>Registra los datos y confirma manualmente la disponibilidad.</p>
        </div>
      </header>

      <div className={styles.formLayout}>
        <section
          className={styles.formPanel}
          aria-labelledby="reservation-data-title"
        >
          <div className="ops-section-heading">
            <div>
              <h2 id="reservation-data-title">Datos de la reservación</h2>
              <p>Cliente, horario y requerimientos</p>
            </div>
          </div>
          <div className={styles.formGrid}>
            <label className="order-field">
              <span>Nombre del cliente</span>
              <input
                onChange={(event) => setGuest(event.target.value)}
                placeholder="Ej. Andrea López"
                value={guest}
              />
            </label>
            <label className="order-field">
              <span>Teléfono</span>
              <input
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+502 5555 0000"
                type="tel"
                value={phone}
              />
            </label>
            <label className="order-field">
              <span>Fecha</span>
              <input
                min="2026-09-11"
                onChange={(event) => setDate(event.target.value)}
                type="date"
                value={date}
              />
            </label>
            <label className="order-field">
              <span>Hora</span>
              <input
                onChange={(event) => setTime(event.target.value)}
                type="time"
                value={time}
              />
            </label>
            <label className="order-field">
              <span>Personas</span>
              <input
                max={20}
                min={1}
                onChange={(event) => setPeople(Number(event.target.value))}
                type="number"
                value={people}
              />
            </label>
            <label className="order-field">
              <span>Origen</span>
              <select
                onChange={(event) =>
                  setSource(event.target.value as ReservationSource)
                }
                value={source}
              >
                <option value="phone">Teléfono</option>
                <option value="walk-in">Presencial</option>
                <option value="online">Solicitud en línea</option>
              </select>
            </label>
            <label className={`order-field ${styles.fullField}`}>
              <span>Mesa sugerida</span>
              <select
                onChange={(event) => setTableNumber(event.target.value)}
                value={tableNumber}
              >
                <option value="">Seleccionar mesa</option>
                {compatibleTables.map((table) => (
                  <option key={table.id} value={table.number}>
                    Mesa {table.number} · {table.capacity} personas ·{" "}
                    {table.status}
                  </option>
                ))}
              </select>
            </label>
            <label className={`order-field ${styles.fullField}`}>
              <span>Notas (opcional)</span>
              <textarea
                onChange={(event) => setNote(event.target.value)}
                placeholder="Celebración, accesibilidad o ubicación preferida"
                rows={3}
                value={note}
              />
            </label>
          </div>
        </section>

        <aside className={styles.confirmPanel}>
          <CalendarCheck aria-hidden="true" size={23} />
          <div>
            <span>Resumen</span>
            <h2>{guest.trim() || "Nueva reservación"}</h2>
          </div>
          <dl>
            <div>
              <dt>Fecha</dt>
              <dd>{date}</dd>
            </div>
            <div>
              <dt>Hora</dt>
              <dd>{time}</dd>
            </div>
            <div>
              <dt>Personas</dt>
              <dd>{people}</dd>
            </div>
            <div>
              <dt>Mesa</dt>
              <dd>{tableNumber || "Sin seleccionar"}</dd>
            </div>
          </dl>

          {conflict ? (
            <div className={styles.validation} role="alert">
              <CircleAlert aria-hidden="true" size={17} />
              <span>
                Conflicto con {conflict.guest} a las {conflict.time}. Elige otra
                mesa u hora.
              </span>
            </div>
          ) : null}
          {isLate ? (
            <div className={styles.validation} role="alert">
              <Clock3 aria-hidden="true" size={17} />
              <span>Después de las 21:15 se requiere preorden.</span>
            </div>
          ) : null}

          <label className={styles.checkRow}>
            <input
              checked={preorder}
              onChange={(event) => setPreorder(event.target.checked)}
              type="checkbox"
            />
            <span>La reservación incluye preorden</span>
          </label>
          <label className={styles.checkRow}>
            <input
              checked={humanConfirmed}
              onChange={(event) => setHumanConfirmed(event.target.checked)}
              type="checkbox"
            />
            <span>Disponibilidad revisada por una persona</span>
          </label>
          <button
            className="button button--primary button--full"
            disabled={!canSave}
            onClick={saveReservation}
            type="button"
          >
            <CalendarCheck aria-hidden="true" size={18} /> Confirmar reservación
          </button>
        </aside>
      </div>

      <p className="mock-disclaimer">
        Conflictos y límites son demostrativos; backend debe revalidar antes de
        confirmar.
      </p>
    </div>
  );
}
