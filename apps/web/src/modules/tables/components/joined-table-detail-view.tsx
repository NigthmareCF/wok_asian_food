"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  CalendarPlus,
  CalendarClock,
  CircleCheck,
  Link2,
  Plus,
  ReceiptText,
  Unlink,
  UsersRound,
  X,
} from "lucide-react";
import {
  currentOperationalUser,
  operationalReservationsToday,
} from "@/data/fixtures/operation";
import { useOrderSession } from "@/modules/orders";
import {
  formatTableNumbers,
  useTableSession,
} from "@/modules/tables/table-session-provider";

export function JoinedTableDetailView({ groupId }: { groupId: string }) {
  const router = useRouter();
  const { tables, joinedGroups, separateTables, updateJoinedGroup } =
    useTableSession();
  const { createTableAccount, tableAccounts } = useOrderSession();
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showReservationPicker, setShowReservationPicker] = useState(false);
  const [selectedReservationId, setSelectedReservationId] = useState("");
  const [feedback, setFeedback] = useState("");
  const [showAccountCreator, setShowAccountCreator] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
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
    .map((tableId) => tables.find((table) => table.id === tableId))
    .filter((table) => Boolean(table));
  const memberReservation = memberTables
    .map((table) => table?.nextReservation)
    .filter((reservation) => Boolean(reservation))
    .sort((a, b) => (a?.time ?? "").localeCompare(b?.time ?? ""))[0];
  const nextReservation = group.reservation ?? memberReservation;
  const capacityDeduction = (group.tableIds.length - 1) * 2;
  const selectedReservation = operationalReservationsToday.find(
    (reservation) => reservation.id === selectedReservationId,
  );
  const groupSource = `Mesas ${group.numbers.join(" y ")} unidas`;
  const openAccounts = tableAccounts[groupSource] ?? [];

  const openGroup = () => {
    updateJoinedGroup(group.id, (current) => ({
      ...current,
      status: "occupied",
      guests: current.reservation?.people ?? 2,
      responsible: currentOperationalUser,
      reservation: undefined,
    }));
    setFeedback(
      group.status === "reserved"
        ? `Reserva recibida; mesas abiertas por ${currentOperationalUser}.`
        : `Mesas abiertas y asignadas a ${currentOperationalUser}.`,
    );
  };

  const assignReservation = () => {
    if (!selectedReservation || selectedReservation.people > group.capacity)
      return;

    updateJoinedGroup(group.id, (current) => ({
      ...current,
      status: "reserved",
      reservation: selectedReservation,
    }));
    setFeedback(
      `Reserva de ${selectedReservation.guest} asignada a las mesas ${formatTableNumbers(group.numbers)}.`,
    );
    setShowReservationPicker(false);
    setSelectedReservationId("");
  };

  const confirmSeparation = () => {
    const result = separateTables(group.id);
    if (result.ok) router.replace("/operation/tables");
  };

  const createAccount = () => {
    if (!newAccountName.trim()) return;
    const account = createTableAccount(groupSource, newAccountName);
    setShowAccountCreator(false);
    setNewAccountName("");
    setFeedback(`Cuenta de ${account.name} abierta para estas mesas.`);
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
        <span
          className={`table-detail__state table-detail__state--${group.status}`}
        >
          {group.status === "occupied"
            ? "Ocupada"
            : group.status === "reserved"
              ? "Reservada"
              : "Libre"}
        </span>
      </header>

      {feedback ? (
        <div className="ops-inline-feedback" role="status">
          <CircleCheck aria-hidden="true" size={18} />
          <span>{feedback}</span>
        </div>
      ) : null}

      <section className="table-detail__summary" aria-label="Resumen de unión">
        <div>
          <span>Estado</span>
          <strong
            className={
              group.status === "occupied" ? "text-danger" : "text-success"
            }
          >
            {group.status === "occupied"
              ? "Ocupada"
              : group.status === "reserved"
                ? "Reservada"
                : "Disponible"}
          </strong>
        </div>
        <div>
          <span>Capacidad</span>
          <strong>{group.capacity} personas</strong>
        </div>
        <div>
          <span>Mesas</span>
          <strong>{formatTableNumbers(group.numbers)}</strong>
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

      {group.status === "free" || group.status === "reserved" ? (
        <section className="table-available-state">
          <div>
            <h2>
              {group.status === "reserved"
                ? "Reserva lista para recibir"
                : "Mesas disponibles"}
            </h2>
            <p>
              {group.status === "reserved"
                ? "Confirma la llegada para abrir la atención conjunta."
                : `Al abrirlas quedarán asignadas automáticamente a ${currentOperationalUser}.`}
            </p>
          </div>
          <div className="table-available-state__actions">
            {group.status === "free" ? (
              <button
                className="button button--secondary"
                onClick={() => setShowReservationPicker(true)}
                type="button"
              >
                <CalendarPlus aria-hidden="true" size={18} /> Asignar reserva
              </button>
            ) : null}
            <button
              className="button button--primary"
              onClick={openGroup}
              type="button"
            >
              <Plus aria-hidden="true" size={18} />
              {group.status === "reserved" ? "Recibir reserva" : "Abrir mesas"}
            </button>
          </div>
        </section>
      ) : (
        <section className="ops-work-panel joined-detail__account">
          <div className="ops-section-heading ops-section-heading--compact">
            <div>
              <h2>Cuenta conjunta</h2>
              <p>
                {group.guests} personas · responsable {group.responsible}
              </p>
            </div>
            <div className="table-account-heading-actions">
              {openAccounts.length > 0 ? (
                <Link
                  className="button button--primary button--compact"
                  href={`/operation/orders/new?tables=${group.numbers.join(",")}`}
                >
                  <ReceiptText aria-hidden="true" size={16} /> Tomar pedido
                  completo
                </Link>
              ) : null}
              <button
                className="button button--secondary button--compact"
                onClick={() => setShowAccountCreator(true)}
                type="button"
              >
                <Plus aria-hidden="true" size={17} /> Abrir cuenta
              </button>
            </div>
          </div>
          {openAccounts.length > 0 ? (
            <div className="table-open-accounts">
              {openAccounts.map((account) => (
                <article key={account.id}>
                  <div>
                    <UsersRound aria-hidden="true" size={17} />
                    <span>
                      <strong>{account.name}</strong>
                      <small>Lista para agregar productos</small>
                    </span>
                  </div>
                  <Link
                    className="button button--secondary button--compact"
                    href={`/operation/orders/new?tables=${group.numbers.join(",")}&account=${encodeURIComponent(account.id)}&accountName=${encodeURIComponent(account.name)}`}
                  >
                    <Plus aria-hidden="true" size={15} /> Agregar productos
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <div className="ops-empty-state table-order-empty">
              <ReceiptText aria-hidden="true" size={24} />
              <strong>Abre la primera cuenta</strong>
              <span>Después podrás reunirlas en un solo pedido.</span>
            </div>
          )}
        </section>
      )}

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
              <strong>− {capacityDeduction} lugares</strong>
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
            disabled={group.status !== "free"}
            onClick={() => setShowConfirmation(true)}
            type="button"
          >
            <Unlink aria-hidden="true" size={17} /> Separar mesas
          </button>
          {group.status !== "free" ? (
            <small>
              Finaliza la reservación o atención antes de separar las mesas.
            </small>
          ) : null}
        </aside>
      </div>

      <p className="mock-disclaimer">
        Esta configuración vive en memoria y se reinicia al recargar.
      </p>

      {showReservationPicker ? (
        <div className="confirm-dialog__backdrop" role="presentation">
          <section
            aria-labelledby="joined-reservation-picker-title"
            aria-modal="true"
            className="confirm-dialog reservation-picker"
            role="dialog"
          >
            <button
              aria-label="Cerrar reservaciones"
              className="icon-button confirm-dialog__close"
              onClick={() => setShowReservationPicker(false)}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
            <span className="confirm-dialog__icon">
              <CalendarPlus aria-hidden="true" size={22} />
            </span>
            <h2 id="joined-reservation-picker-title">Reservaciones de hoy</h2>
            <p>
              Selecciona una reservación compatible con la capacidad conjunta.
            </p>
            <div className="reservation-picker__list">
              {operationalReservationsToday.map((reservation) => {
                const compatible = reservation.people <= group.capacity;
                return (
                  <label
                    className={compatible ? "" : "is-disabled"}
                    key={reservation.id}
                  >
                    <input
                      checked={selectedReservationId === reservation.id}
                      disabled={!compatible}
                      name="joined-reservation"
                      onChange={() => setSelectedReservationId(reservation.id)}
                      type="radio"
                    />
                    <span>{reservation.time}</span>
                    <div>
                      <strong>{reservation.guest}</strong>
                      <small>
                        {reservation.people} personas
                        {reservation.note ? ` · ${reservation.note}` : ""}
                      </small>
                    </div>
                    {!compatible ? <small>Supera capacidad</small> : null}
                  </label>
                );
              })}
            </div>
            <div className="confirm-dialog__actions">
              <button
                className="button button--secondary"
                onClick={() => setShowReservationPicker(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="button button--primary"
                disabled={!selectedReservation}
                onClick={assignReservation}
                type="button"
              >
                Asignar reservación
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {showAccountCreator ? (
        <div className="confirm-dialog__backdrop" role="presentation">
          <section
            aria-labelledby="create-joined-account-title"
            aria-modal="true"
            className="confirm-dialog"
            role="dialog"
          >
            <button
              aria-label="Cerrar nueva cuenta"
              className="icon-button confirm-dialog__close"
              onClick={() => setShowAccountCreator(false)}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
            <span className="confirm-dialog__icon">
              <UsersRound aria-hidden="true" size={22} />
            </span>
            <h2 id="create-joined-account-title">Abrir cuenta</h2>
            <p>Identifica a la persona dentro de la atención conjunta.</p>
            <label className="order-field create-account-field">
              <span>Nombre de la cuenta</span>
              <input
                autoFocus
                onChange={(event) => setNewAccountName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") createAccount();
                }}
                placeholder="Ej. Pepito"
                value={newAccountName}
              />
            </label>
            <div className="confirm-dialog__actions">
              <button
                className="button button--secondary"
                onClick={() => setShowAccountCreator(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="button button--primary"
                disabled={!newAccountName.trim()}
                onClick={createAccount}
                type="button"
              >
                Guardar cuenta
              </button>
            </div>
          </section>
        </div>
      ) : null}

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
              Separar mesas {formatTableNumbers(group.numbers)}
            </h2>
            <p>
              Las {group.tableIds.length} mesas recuperarán su estado libre y
              capacidad original.
            </p>
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
