"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  CalendarCheck,
  Check,
  Clock3,
  Pencil,
  Save,
  UsersRound,
} from "lucide-react";
import { operationalTables } from "@/data/fixtures/operation";
import { reservationStatusMeta } from "@/data/fixtures/reservations";
import { useReservationSession } from "../reservation-session-provider";
import styles from "./reservations.module.css";

export function ReservationDetailView({
  reservationId,
}: {
  reservationId: string;
}) {
  const { reservations, updateReservation, updateReservationStatus } =
    useReservationSession();
  const reservation = reservations.find((item) => item.id === reservationId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(reservation);
  const [feedback, setFeedback] = useState("");

  if (!reservation || !draft) {
    return (
      <div className={styles.page}>
        <Link className="text-action" href="/operation/reservations">
          <ArrowLeft aria-hidden="true" size={16} /> Volver a reservaciones
        </Link>
        <div className={styles.empty}>
          <CalendarCheck aria-hidden="true" size={24} />
          <strong>Reservación no disponible</strong>
          <span>Puede haberse reiniciado junto con los datos simulados.</span>
        </div>
      </div>
    );
  }

  const status = reservationStatusMeta[reservation.status];
  const saveChanges = () => {
    updateReservation(reservation.id, draft);
    setEditing(false);
    setFeedback("Cambios guardados en la agenda simulada.");
  };

  const markArrival = () => {
    updateReservationStatus(reservation.id, "confirmed");
    setFeedback("Llegada confirmada. La mesa puede abrirse desde el salón.");
  };

  return (
    <div className={styles.page}>
      <header className={`ops-page-header ${styles.header}`}>
        <div>
          <Link className="text-action" href="/operation/reservations">
            <ArrowLeft aria-hidden="true" size={16} /> Volver a reservaciones
          </Link>
          <span className="ops-kicker">Reservación #{reservation.id}</span>
          <h1>{reservation.guest}</h1>
          <p>{reservation.phone}</p>
        </div>
        <span className={`${styles.status} ${styles[`status_${status.tone}`]}`}>
          {status.label}
        </span>
      </header>

      {feedback ? (
        <div className="ops-inline-feedback" role="status">
          <Check aria-hidden="true" size={18} /> {feedback}
        </div>
      ) : null}

      <section
        className={styles.detailSummary}
        aria-label="Resumen de reservación"
      >
        <div>
          <Clock3 aria-hidden="true" size={18} />
          <span>Fecha y hora</span>
          <strong>
            {reservation.date} · {reservation.time}
          </strong>
        </div>
        <div>
          <UsersRound aria-hidden="true" size={18} />
          <span>Personas</span>
          <strong>{reservation.people}</strong>
        </div>
        <div>
          <CalendarCheck aria-hidden="true" size={18} />
          <span>Mesa</span>
          <strong>{reservation.tableNumber ?? "Por asignar"}</strong>
        </div>
      </section>

      <div className={styles.detailLayout}>
        <section className={styles.formPanel}>
          <div className="ops-section-heading">
            <div>
              <h2>Datos registrados</h2>
              <p>Origen: {reservation.source}</p>
            </div>
            <button
              className="button button--secondary button--compact"
              onClick={() => {
                if (editing) setDraft(reservation);
                setEditing((current) => !current);
              }}
              type="button"
            >
              <Pencil aria-hidden="true" size={16} />
              {editing ? "Cancelar edición" : "Editar"}
            </button>
          </div>

          {editing ? (
            <div className={styles.formGrid}>
              <label className="order-field">
                <span>Cliente</span>
                <input
                  onChange={(event) =>
                    setDraft({ ...draft, guest: event.target.value })
                  }
                  value={draft.guest}
                />
              </label>
              <label className="order-field">
                <span>Teléfono</span>
                <input
                  onChange={(event) =>
                    setDraft({ ...draft, phone: event.target.value })
                  }
                  value={draft.phone}
                />
              </label>
              <label className="order-field">
                <span>Fecha</span>
                <input
                  onChange={(event) =>
                    setDraft({ ...draft, date: event.target.value })
                  }
                  type="date"
                  value={draft.date}
                />
              </label>
              <label className="order-field">
                <span>Hora</span>
                <input
                  onChange={(event) =>
                    setDraft({ ...draft, time: event.target.value })
                  }
                  type="time"
                  value={draft.time}
                />
              </label>
              <label className="order-field">
                <span>Personas</span>
                <input
                  min={1}
                  onChange={(event) =>
                    setDraft({ ...draft, people: Number(event.target.value) })
                  }
                  type="number"
                  value={draft.people}
                />
              </label>
              <label className="order-field">
                <span>Mesa</span>
                <select
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      tableNumber: Number(event.target.value),
                    })
                  }
                  value={draft.tableNumber ?? ""}
                >
                  <option value="">Por asignar</option>
                  {operationalTables
                    .filter((table) => table.capacity >= draft.people)
                    .map((table) => (
                      <option key={table.id} value={table.number}>
                        Mesa {table.number} · {table.capacity} personas
                      </option>
                    ))}
                </select>
              </label>
              <label className={`order-field ${styles.fullField}`}>
                <span>Nota</span>
                <textarea
                  onChange={(event) =>
                    setDraft({ ...draft, note: event.target.value })
                  }
                  rows={3}
                  value={draft.note ?? ""}
                />
              </label>
              <button
                className="button button--primary"
                onClick={saveChanges}
                type="button"
              >
                <Save aria-hidden="true" size={17} /> Guardar cambios
              </button>
            </div>
          ) : (
            <dl className={styles.detailList}>
              <div>
                <dt>Cliente</dt>
                <dd>{reservation.guest}</dd>
              </div>
              <div>
                <dt>Teléfono</dt>
                <dd>{reservation.phone}</dd>
              </div>
              <div>
                <dt>Preorden</dt>
                <dd>{reservation.preorder ? "Sí" : "No"}</dd>
              </div>
              <div>
                <dt>Nota</dt>
                <dd>{reservation.note ?? "Sin indicaciones"}</dd>
              </div>
            </dl>
          )}
        </section>

        <aside className={styles.confirmPanel}>
          <span>Acciones</span>
          <h2>Gestionar llegada</h2>
          <button
            className="button button--primary button--full"
            onClick={markArrival}
            type="button"
          >
            <Check aria-hidden="true" size={18} /> Confirmar llegada
          </button>
          {reservation.tableNumber ? (
            <Link
              className="button button--secondary button--full"
              href={`/operation/tables/table-${reservation.tableNumber}`}
            >
              Abrir mesa {reservation.tableNumber}
            </Link>
          ) : null}
          <button
            className="button button--secondary button--full"
            onClick={() => updateReservationStatus(reservation.id, "expired")}
            type="button"
          >
            Marcar como vencida
          </button>
        </aside>
      </div>

      <p className="mock-disclaimer">
        Cambios locales hasta integrar permisos, persistencia y auditoría.
      </p>
    </div>
  );
}
