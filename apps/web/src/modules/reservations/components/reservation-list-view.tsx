"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plus,
  Search,
  UsersRound,
} from "lucide-react";
import {
  reservationStatusMeta,
  type ReservationStatus,
} from "@/data/fixtures/reservations";
import { useReservationSession } from "../reservation-session-provider";
import styles from "./reservations.module.css";

type AgendaRange = "day" | "week" | "month";
type StatusFilter = "all" | ReservationStatus;

const rangeLabels: Record<AgendaRange, string> = {
  day: "Día",
  week: "Semana",
  month: "Mes",
};

const formatDate = (date: string, range: AgendaRange) =>
  new Intl.DateTimeFormat("es-GT", {
    day: range === "month" ? undefined : "numeric",
    month: "long",
    weekday: range === "day" ? "long" : undefined,
    year: range === "month" ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

const shiftDate = (date: string, range: AgendaRange, amount: number) => {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(
    next.getUTCDate() +
      amount * (range === "week" ? 7 : range === "month" ? 30 : 1),
  );
  return next.toISOString().slice(0, 10);
};

export function ReservationListView() {
  const { reservations } = useReservationSession();
  const [range, setRange] = useState<AgendaRange>("day");
  const [focusDate, setFocusDate] = useState("2026-09-11");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const visibleReservations = useMemo(() => {
    const start = new Date(`${focusDate}T00:00:00Z`);
    const end = new Date(start);
    end.setUTCDate(
      end.getUTCDate() + (range === "day" ? 1 : range === "week" ? 7 : 31),
    );
    const normalizedQuery = query.trim().toLocaleLowerCase("es");

    return reservations
      .filter((reservation) => {
        const reservationDate = new Date(`${reservation.date}T12:00:00Z`);
        const inRange =
          range === "month"
            ? reservation.date.slice(0, 7) === focusDate.slice(0, 7)
            : reservationDate >= start && reservationDate < end;
        return (
          inRange &&
          (status === "all" || reservation.status === status) &&
          (!normalizedQuery ||
            reservation.guest
              .toLocaleLowerCase("es")
              .includes(normalizedQuery) ||
            reservation.phone.includes(normalizedQuery))
        );
      })
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  }, [focusDate, query, range, reservations, status]);

  const confirmed = visibleReservations.filter((item) =>
    ["confirmed", "preorder"].includes(item.status),
  ).length;
  const attention = visibleReservations.filter((item) =>
    ["late", "expired"].includes(item.status),
  ).length;

  return (
    <div className={styles.page}>
      <header className="ops-page-header">
        <div>
          <span className="ops-kicker">Agenda operativa</span>
          <h1>Reservaciones</h1>
          <p>Consulta disponibilidad, confirma llegadas y organiza el salón.</p>
        </div>
        <Link
          className="button button--primary"
          href="/operation/reservations/new"
        >
          <Plus aria-hidden="true" size={18} /> Nueva reservación
        </Link>
      </header>

      <section className={styles.summary} aria-label="Resumen de reservaciones">
        <div>
          <span>En agenda</span>
          <strong>{visibleReservations.length}</strong>
        </div>
        <div>
          <span>Confirmadas</span>
          <strong>{confirmed}</strong>
        </div>
        <div>
          <span>Personas</span>
          <strong>
            {visibleReservations.reduce(
              (total, item) => total + item.people,
              0,
            )}
          </strong>
        </div>
        <div className={attention ? styles.attention : ""}>
          <span>Requieren atención</span>
          <strong>{attention}</strong>
        </div>
      </section>

      <section className={styles.toolbar} aria-label="Controles de agenda">
        <div className={styles.segmented}>
          {(Object.keys(rangeLabels) as AgendaRange[]).map((value) => (
            <button
              aria-pressed={range === value}
              key={value}
              onClick={() => setRange(value)}
              type="button"
            >
              {rangeLabels[value]}
            </button>
          ))}
        </div>
        <div className={styles.dateNavigation}>
          <button
            aria-label="Periodo anterior"
            className="icon-button"
            onClick={() => setFocusDate(shiftDate(focusDate, range, -1))}
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={18} />
          </button>
          <strong>{formatDate(focusDate, range)}</strong>
          <button
            aria-label="Periodo siguiente"
            className="icon-button"
            onClick={() => setFocusDate(shiftDate(focusDate, range, 1))}
            type="button"
          >
            <ChevronRight aria-hidden="true" size={18} />
          </button>
        </div>
        <label className={styles.search}>
          <Search aria-hidden="true" size={17} />
          <span className="sr-only">Buscar cliente o teléfono</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar cliente o teléfono"
            type="search"
            value={query}
          />
        </label>
      </section>

      <div className={styles.statusFilters} aria-label="Filtrar por estado">
        <button
          aria-pressed={status === "all"}
          onClick={() => setStatus("all")}
          type="button"
        >
          Todas
        </button>
        {(Object.keys(reservationStatusMeta) as ReservationStatus[]).map(
          (value) => (
            <button
              aria-pressed={status === value}
              key={value}
              onClick={() => setStatus(value)}
              type="button"
            >
              {reservationStatusMeta[value].label}
            </button>
          ),
        )}
      </div>

      <section className={styles.list} aria-label="Agenda de reservaciones">
        {visibleReservations.length ? (
          visibleReservations.map((reservation) => {
            const statusMeta = reservationStatusMeta[reservation.status];
            return (
              <Link
                className={styles.row}
                href={`/operation/reservations/${reservation.id}`}
                key={reservation.id}
              >
                <div className={styles.time}>
                  <Clock3 aria-hidden="true" size={17} />
                  <strong>{reservation.time}</strong>
                  {range !== "day" ? (
                    <small>{reservation.date.slice(5)}</small>
                  ) : null}
                </div>
                <div className={styles.guest}>
                  <strong>{reservation.guest}</strong>
                  <span>{reservation.phone}</span>
                  {reservation.note ? <small>{reservation.note}</small> : null}
                </div>
                <div className={styles.people}>
                  <UsersRound aria-hidden="true" size={16} />
                  <span>{reservation.people}</span>
                </div>
                <div className={styles.table}>
                  <span>Mesa</span>
                  <strong>{reservation.tableNumber ?? "Por asignar"}</strong>
                </div>
                <span
                  className={`${styles.status} ${styles[`status_${statusMeta.tone}`]}`}
                >
                  {statusMeta.label}
                </span>
                <ChevronRight aria-hidden="true" size={17} />
              </Link>
            );
          })
        ) : (
          <div className={styles.empty}>
            <CalendarDays aria-hidden="true" size={25} />
            <strong>Sin reservaciones en este periodo</strong>
            <span>
              Ajusta la fecha o los filtros para consultar otra agenda.
            </span>
          </div>
        )}
      </section>

      <p className="mock-disclaimer">
        Agenda y disponibilidad simuladas hasta integrar persistencia y reglas
        del backend.
      </p>
    </div>
  );
}
