"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  CircleAlert,
  CircleCheck,
  CreditCard,
  FileText,
  Plus,
  ReceiptText,
  Send,
  Split,
  UserRound,
  X,
} from "lucide-react";
import type {
  OperationalTable,
  TableOrderItem,
} from "@/data/fixtures/operation";

type TableAction = "charge" | "split" | "transfer" | "release";

const actionContent: Record<
  TableAction,
  { title: string; description: string; confirm: string }
> = {
  charge: {
    title: "Confirmar cobro",
    description: "Verifica el monto y el método de pago antes de continuar.",
    confirm: "Confirmar cobro",
  },
  split: {
    title: "Dividir cuenta",
    description: "Se crearán cuentas separadas para distribuir los productos.",
    confirm: "Crear cuentas",
  },
  transfer: {
    title: "Trasladar mesa",
    description: "El pedido y el saldo pasarán a la mesa seleccionada.",
    confirm: "Confirmar traslado",
  },
  release: {
    title: "Liberar mesa",
    description: "La mesa quedará disponible para una nueva atención.",
    confirm: "Confirmar liberación",
  },
};

const money = new Intl.NumberFormat("es-GT", {
  style: "currency",
  currency: "GTQ",
});

const detailStatusLabel: Record<OperationalTable["status"], string> = {
  free: "Libre",
  occupied: "Ocupada",
  reserved: "Reservada",
  preparing: "Preparación",
  "out-of-service": "Fuera de servicio",
};

export function TableDetailView({
  initialTable,
  items,
}: {
  initialTable: OperationalTable;
  items: TableOrderItem[];
}) {
  const [table, setTable] = useState(initialTable);
  const [responsible, setResponsible] = useState(
    initialTable.responsible ?? "Sin asignar",
  );
  const [activeAction, setActiveAction] = useState<TableAction | null>(null);
  const [feedback, setFeedback] = useState("");

  const canRelease = table.balance === 0 && table.status === "occupied";
  const isAvailable = table.status === "free";
  const isReserved = table.status === "reserved";
  const isServicePending =
    table.status === "preparing" || table.status === "out-of-service";

  const assignResponsible = () => {
    setTable((current) => ({ ...current, responsible }));
    setFeedback(`Mesa asignada a ${responsible}.`);
  };

  const openTable = () => {
    setTable((current) => ({
      ...current,
      status: "occupied",
      guests: current.nextReservation?.people ?? 2,
      responsible: responsible === "Sin asignar" ? "Sofia M." : responsible,
      openedAt: "Ahora",
      elapsed: "0 min",
    }));
    setResponsible((current) =>
      current === "Sin asignar" ? "Sofia M." : current,
    );
    setFeedback(
      isReserved ? "Reserva recibida y mesa abierta." : "Mesa abierta.",
    );
  };

  const markAvailable = () => {
    if (table.status === "preparing") {
      setTable((current) => ({ ...current, status: "free" }));
      setFeedback("Mesa marcada como libre.");
      return;
    }

    setFeedback("Revisión solicitada al responsable del salón.");
  };

  const confirmAction = () => {
    if (!activeAction) return;

    if (activeAction === "charge") {
      setTable((current) => ({ ...current, balance: 0 }));
      setFeedback("Cobro registrado. La mesa ya puede liberarse.");
    } else if (activeAction === "release") {
      setTable((current) => ({
        ...current,
        status: "free",
        guests: 0,
        balance: 0,
        orderId: undefined,
        elapsed: undefined,
        openedAt: undefined,
      }));
      setFeedback("Mesa liberada correctamente.");
    } else if (activeAction === "split") {
      setFeedback("Se prepararon dos cuentas para distribuir productos.");
    } else {
      setFeedback("Traslado preparado; falta confirmación del destino.");
    }

    setActiveAction(null);
  };

  return (
    <div className="ops-dashboard table-detail">
      <header className="ops-page-header ops-page-header--focused">
        <div>
          <Link className="text-action" href="/operation/tables">
            <ArrowLeft aria-hidden="true" size={15} /> Volver a mesas
          </Link>
          <span className="ops-kicker">{table.zone}</span>
          <h1>Mesa {table.number}</h1>
          <p>
            {table.status === "occupied"
              ? `${table.guests} personas · abierta hace ${table.elapsed ?? "0 min"}`
              : "Información y acciones de atención."}
          </p>
        </div>
        <span
          className={`table-detail__state table-detail__state--${table.status}`}
        >
          {detailStatusLabel[table.status]}
        </span>
      </header>

      {feedback ? (
        <div className="ops-inline-feedback" role="status">
          <CircleCheck aria-hidden="true" size={18} />
          <span>{feedback}</span>
        </div>
      ) : null}

      <section className="table-detail__summary" aria-label="Resumen de mesa">
        <div>
          <span>Responsable</span>
          <strong>{table.responsible ?? "Sin asignar"}</strong>
        </div>
        <div>
          <span>Personas</span>
          <strong>{table.guests || "—"}</strong>
        </div>
        <div>
          <span>Pedido</span>
          <strong>{table.orderId ? `#${table.orderId}` : "Sin pedido"}</strong>
        </div>
        <div>
          <span>Saldo pendiente</span>
          <strong
            className={table.balance > 0 ? "text-danger" : "text-success"}
          >
            {money.format(table.balance)}
          </strong>
        </div>
      </section>

      {table.nextReservation ? (
        <section
          className="table-reservation-strip"
          aria-label="Próxima reserva"
        >
          <CalendarClock aria-hidden="true" size={19} />
          <div>
            <span>Próxima reserva</span>
            <strong>
              {table.nextReservation.time} · {table.nextReservation.guest}
            </strong>
          </div>
          <span>{table.nextReservation.people} personas</span>
        </section>
      ) : null}

      {isAvailable || isReserved ? (
        <section className="table-available-state">
          <div>
            <h2>
              {isReserved ? "Reserva lista para recibir" : "Mesa disponible"}
            </h2>
            <p>
              {isReserved
                ? "Confirma la llegada para iniciar la atención."
                : "Asigna un responsable al abrir la mesa."}
            </p>
          </div>
          <button
            className="button button--primary"
            onClick={openTable}
            type="button"
          >
            <Plus aria-hidden="true" size={18} />
            {isReserved ? "Recibir reserva" : "Abrir mesa"}
          </button>
        </section>
      ) : isServicePending ? (
        <section className="table-available-state">
          <div>
            <h2>
              {table.status === "preparing"
                ? "Mesa en preparación"
                : "Mesa fuera de servicio"}
            </h2>
            <p>
              {table.status === "preparing"
                ? "Confirma la limpieza antes de recibir nuevos clientes."
                : "Debe revisarse antes de volver a habilitarla."}
            </p>
          </div>
          <button
            className="button button--secondary"
            onClick={markAvailable}
            type="button"
          >
            {table.status === "preparing"
              ? "Marcar como libre"
              : "Solicitar revisión"}
          </button>
        </section>
      ) : (
        <div className="table-detail__workspace">
          <section className="ops-work-panel" aria-labelledby="account-title">
            <div className="ops-section-heading ops-section-heading--compact">
              <div>
                <h2 id="account-title">Cuenta actual</h2>
                <p>{items.length} productos registrados</p>
              </div>
              <Link
                className="button button--primary button--compact"
                href={`/operation/orders/new?table=${table.number}`}
              >
                <Plus aria-hidden="true" size={17} /> Agregar
              </Link>
            </div>

            <div className="table-order-list">
              {items.length > 0 ? (
                items.map((item) => (
                  <article className="table-order-row" key={item.id}>
                    <strong>{item.quantity}</strong>
                    <div>
                      <span>{item.name}</span>
                      {item.notes ? <small>{item.notes}</small> : null}
                    </div>
                    <span>{money.format(item.quantity * item.unitPrice)}</span>
                  </article>
                ))
              ) : (
                <div className="ops-empty-state table-order-empty">
                  <ReceiptText aria-hidden="true" size={24} />
                  <strong>Aún no hay productos</strong>
                  <span>Agrega productos para crear la cuenta.</span>
                </div>
              )}
            </div>

            <div className="table-account-total">
              <span>Total pendiente</span>
              <strong>{money.format(table.balance)}</strong>
            </div>
          </section>

          <aside className="table-detail__side">
            <section className="ops-work-panel">
              <div className="ops-section-heading ops-section-heading--compact">
                <div>
                  <h2>Responsable</h2>
                  <p>Asignación simulada</p>
                </div>
                <UserRound aria-hidden="true" size={19} />
              </div>
              <label className="table-assignment">
                <span>Mesero asignado</span>
                <select
                  onChange={(event) => setResponsible(event.target.value)}
                  value={responsible}
                >
                  <option>Sin asignar</option>
                  <option>Sofia M.</option>
                  <option>Marco R.</option>
                  <option>Luis A.</option>
                </select>
              </label>
              <button
                className="button button--secondary button--compact button--full"
                disabled={responsible === "Sin asignar"}
                onClick={assignResponsible}
                type="button"
              >
                Guardar responsable
              </button>
            </section>

            <section
              className="ops-work-panel table-actions"
              aria-labelledby="actions-title"
            >
              <div className="ops-section-heading ops-section-heading--compact">
                <div>
                  <h2 id="actions-title">Acciones de cuenta</h2>
                  <p>Requieren confirmación</p>
                </div>
              </div>
              <button onClick={() => setActiveAction("split")} type="button">
                <Split aria-hidden="true" size={18} /> Dividir cuenta
              </button>
              <button
                onClick={() => {
                  setFeedback("Precuenta preparada para impresión.");
                }}
                type="button"
              >
                <FileText aria-hidden="true" size={18} /> Precuenta
              </button>
              <button onClick={() => setActiveAction("charge")} type="button">
                <CreditCard aria-hidden="true" size={18} /> Cobrar
              </button>
              <button onClick={() => setActiveAction("transfer")} type="button">
                <Send aria-hidden="true" size={18} /> Trasladar mesa
              </button>
            </section>

            <section className="table-release">
              <button
                className="button button--secondary button--full"
                disabled={!canRelease}
                onClick={() => setActiveAction("release")}
                type="button"
              >
                Liberar mesa
              </button>
              {table.balance > 0 ? (
                <p>
                  <CircleAlert aria-hidden="true" size={15} />
                  No se puede liberar mientras exista saldo pendiente.
                </p>
              ) : null}
            </section>
          </aside>
        </div>
      )}

      <p className="mock-disclaimer">
        Datos y permisos simulados; cobros y cambios requieren validación del
        backend.
      </p>

      {activeAction ? (
        <div className="confirm-dialog__backdrop" role="presentation">
          <section
            aria-labelledby="confirm-dialog-title"
            aria-modal="true"
            className="confirm-dialog"
            role="dialog"
          >
            <button
              aria-label="Cerrar confirmación"
              className="icon-button confirm-dialog__close"
              onClick={() => setActiveAction(null)}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
            <span className="confirm-dialog__icon">
              <CircleAlert aria-hidden="true" size={22} />
            </span>
            <h2 id="confirm-dialog-title">
              {actionContent[activeAction].title}
            </h2>
            <p>{actionContent[activeAction].description}</p>
            {activeAction === "charge" ? (
              <strong className="confirm-dialog__amount">
                {money.format(table.balance)}
              </strong>
            ) : null}
            <div className="confirm-dialog__actions">
              <button
                className="button button--secondary"
                onClick={() => setActiveAction(null)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="button button--primary"
                onClick={confirmAction}
                type="button"
              >
                {actionContent[activeAction].confirm}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
