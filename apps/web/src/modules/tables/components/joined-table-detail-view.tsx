"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  Link2,
  Unlink,
  UsersRound,
  X,
} from "lucide-react";
import { operationalTables } from "@/data/fixtures/operation";
import { useTableSession } from "@/modules/tables/table-session-provider";

export function JoinedTableDetailView({ groupId }: { groupId: string }) {
  const router = useRouter();
  const { joinedGroups, separateTables } = useTableSession();
  const [showConfirmation, setShowConfirmation] = useState(false);
  const group = joinedGroups.find((item) => item.id === groupId);

  if (!group) {
    return (
      <div className="ops-dashboard table-detail">
        <header className="ops-page-header ops-page-header--focused">
          <div>
            <Link className="text-action" href="/operation/tables">
              <ArrowLeft aria-hidden="true" size={15} /> Volver a mesas
            </Link>
            <span className="ops-kicker">Unión temporal</span>
            <h1>Esta unión ya no está activa</h1>
            <p>Las uniones simuladas se reinician al recargar la página.</p>
          </div>
        </header>
        <section className="joined-detail__expired">
          <Link2 aria-hidden="true" size={28} />
          <div>
            <h2>Vuelve al mapa para crearla nuevamente</h2>
            <p>
              No se perdió información real porque aún no existe integración con
              backend.
            </p>
          </div>
          <Link className="button button--primary" href="/operation/tables">
            Abrir mapa de mesas
          </Link>
        </section>
      </div>
    );
  }

  const memberTables = group.tableIds
    .map((tableId) => operationalTables.find((table) => table.id === tableId))
    .filter((table) => Boolean(table));
  const nextReservation = memberTables
    .map((table) => table?.nextReservation)
    .filter((reservation) => Boolean(reservation))
    .sort((a, b) => (a?.time ?? "").localeCompare(b?.time ?? ""))[0];

  const confirmSeparation = () => {
    const result = separateTables(group.id);
    if (result.ok) router.replace("/operation/tables");
  };

  return (
    <div className="ops-dashboard table-detail joined-detail">
      <header className="ops-page-header ops-page-header--focused">
        <div>
          <Link className="text-action" href="/operation/tables">
            <ArrowLeft aria-hidden="true" size={15} /> Volver a mesas
          </Link>
          <span className="ops-kicker">{group.zone}</span>
          <h1>Mesas {group.numbers.join(" + ")}</h1>
          <p>Configuración combinada disponible durante esta sesión.</p>
        </div>
        <span className="table-detail__state table-detail__state--joined">
          Unidas
        </span>
      </header>

      <section className="table-detail__summary" aria-label="Resumen de unión">
        <div>
          <span>Estado</span>
          <strong className="text-success">Disponible</strong>
        </div>
        <div>
          <span>Capacidad</span>
          <strong>{group.capacity} personas</strong>
        </div>
        <div>
          <span>Mesas</span>
          <strong>{group.numbers.join(" y ")}</strong>
        </div>
        <div>
          <span>Zona</span>
          <strong>{group.zone}</strong>
        </div>
      </section>

      {nextReservation ? (
        <section
          className="table-reservation-strip"
          aria-label="Próxima reserva"
        >
          <CalendarClock aria-hidden="true" size={19} />
          <div>
            <span>Próxima reserva</span>
            <strong>
              {nextReservation.time} · {nextReservation.guest}
            </strong>
          </div>
          <span>{nextReservation.people} personas</span>
        </section>
      ) : null}

      <div className="joined-detail__grid">
        <section className="ops-work-panel" aria-labelledby="composition-title">
          <div className="ops-section-heading ops-section-heading--compact">
            <div>
              <h2 id="composition-title">Composición de la unión</h2>
              <p>Capacidad calculada para mesas cuadradas</p>
            </div>
            <Link2 aria-hidden="true" size={19} />
          </div>
          <div className="joined-detail__breakdown">
            {memberTables.map((table) =>
              table ? (
                <div className="joined-detail__row" key={table.id}>
                  <span>Mesa {table.number}</span>
                  <strong>{table.capacity} lugares</strong>
                </div>
              ) : null,
            )}
            <div className="joined-detail__row joined-detail__row--deduction">
              <span>Caras en contacto</span>
              <strong>− 2 lugares</strong>
            </div>
            <div className="joined-detail__row joined-detail__row--total">
              <span>Capacidad combinada</span>
              <strong>{group.capacity} personas</strong>
            </div>
          </div>
        </section>

        <aside className="ops-work-panel joined-detail__actions">
          <div className="ops-section-heading ops-section-heading--compact">
            <div>
              <h2>Acciones</h2>
              <p>Configuración temporal</p>
            </div>
            <UsersRound aria-hidden="true" size={19} />
          </div>
          <p>
            La unión permanecerá activa mientras navegues dentro del sistema.
          </p>
          <button
            className="button button--secondary button--full"
            onClick={() => setShowConfirmation(true)}
            type="button"
          >
            <Unlink aria-hidden="true" size={17} /> Separar mesas
          </button>
        </aside>
      </div>

      <p className="mock-disclaimer">
        Esta configuración vive en memoria y se reinicia al recargar.
      </p>

      {showConfirmation ? (
        <div className="confirm-dialog__backdrop" role="presentation">
          <section
            aria-labelledby="joined-separate-title"
            aria-modal="true"
            className="confirm-dialog"
            role="dialog"
          >
            <button
              aria-label="Cerrar confirmación"
              className="icon-button confirm-dialog__close"
              onClick={() => setShowConfirmation(false)}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
            <span className="confirm-dialog__icon">
              <Unlink aria-hidden="true" size={22} />
            </span>
            <h2 id="joined-separate-title">
              Separar mesas {group.numbers.join(" y ")}
            </h2>
            <p>Ambas mesas recuperarán su estado libre y capacidad original.</p>
            <div className="confirm-dialog__actions">
              <button
                className="button button--secondary"
                onClick={() => setShowConfirmation(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="button button--primary"
                onClick={confirmSeparation}
                type="button"
              >
                Confirmar separación
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
