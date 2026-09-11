"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  CalendarPlus,
  CalendarClock,
  CircleAlert,
  CircleCheck,
  CreditCard,
  FileText,
  Package,
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
import {
  currentOperationalUser,
  operationalReservationsToday,
} from "@/data/fixtures/operation";
import { getOrderTotal, type OrderItem } from "@/data/fixtures/orders";
import { useOrderSession } from "@/modules/orders";
import { useTableSession } from "@/modules/tables/table-session-provider";

type TableAction = "charge" | "transfer" | "release";

const actionContent: Record<
  TableAction,
  { title: string; description: string; confirm: string }
> = {
  charge: {
    title: "Confirmar cobro",
    description: "Verifica el monto y el método de pago antes de continuar.",
    confirm: "Confirmar cobro",
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
  const { tables, updateTable } = useTableSession();
  const {
    clearTableAccounts,
    createTableAccount,
    markOrdersPaid,
    orders,
    tableAccounts,
  } = useOrderSession();
  const table =
    tables.find((item) => item.id === initialTable.id) ?? initialTable;
  const [activeAction, setActiveAction] = useState<TableAction | null>(null);
  const [showReservationPicker, setShowReservationPicker] = useState(false);
  const [selectedReservationId, setSelectedReservationId] = useState("");
  const [feedback, setFeedback] = useState("");
  const [showAccountCreator, setShowAccountCreator] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");

  const tableSource = `Mesa ${table.number}`;
  const sourceOrders = orders.filter(
    (order) => order.channel === "table" && order.source === tableSource,
  );
  const pendingOrders = sourceOrders.filter(
    (order) => order.status !== "cancelled" && order.paymentStatus !== "paid",
  );
  const orderLines = pendingOrders.flatMap((order) =>
    order.items.map((item) => ({
      key: `${order.id}:${item.id}`,
      orderId: order.id,
      item,
    })),
  );
  const fallbackLines =
    sourceOrders.length === 0 && table.balance > 0
      ? items.map((item) => ({
          key: `fixture:${item.id}`,
          orderId: table.orderId,
          item: {
            ...item,
            productId: item.id,
            modifiers: [],
            fulfillment: undefined,
            readyAt: undefined,
          } satisfies OrderItem,
        }))
      : [];
  const accountLines = orderLines.length > 0 ? orderLines : fallbackLines;
  const pendingTotal =
    orderLines.length > 0
      ? pendingOrders.reduce(
          (total, order) => total + getOrderTotal(order.items),
          0,
        )
      : table.balance;
  const productCount = accountLines.reduce(
    (total, line) => total + line.item.quantity,
    0,
  );
  const openAccounts = tableAccounts[tableSource] ?? [];
  const canRelease = pendingTotal === 0 && table.status === "occupied";
  const isAvailable = table.status === "free";
  const isReserved = table.status === "reserved";
  const isServicePending =
    table.status === "preparing" || table.status === "out-of-service";

  const selectedReservation = operationalReservationsToday.find(
    (reservation) => reservation.id === selectedReservationId,
  );

  const openTable = () => {
    updateTable(table.id, (current) => ({
      ...current,
      status: "occupied",
      guests: current.nextReservation?.people ?? 2,
      responsible: currentOperationalUser,
      openedAt: "Ahora",
      elapsed: "0 min",
      nextReservation:
        current.status === "reserved" ? undefined : current.nextReservation,
    }));
    setFeedback(
      isReserved
        ? `Reserva recibida; mesa abierta por ${currentOperationalUser}.`
        : `Mesa abierta y asignada a ${currentOperationalUser}.`,
    );
  };

  const assignReservation = () => {
    if (!selectedReservation || selectedReservation.people > table.capacity)
      return;

    updateTable(table.id, (current) => ({
      ...current,
      status: "reserved",
      nextReservation: {
        time: selectedReservation.time,
        guest: selectedReservation.guest,
        people: selectedReservation.people,
      },
    }));
    setFeedback(
      `Reserva de ${selectedReservation.guest} asignada a la mesa ${table.number}.`,
    );
    setShowReservationPicker(false);
    setSelectedReservationId("");
  };

  const markAvailable = () => {
    if (table.status === "preparing") {
      updateTable(table.id, (current) => ({ ...current, status: "free" }));
      setFeedback("Mesa marcada como libre.");
      return;
    }

    setFeedback("Revisión solicitada al responsable del salón.");
  };

  const createAccount = () => {
    if (!newAccountName.trim()) return;
    const account = createTableAccount(tableSource, newAccountName);
    setShowAccountCreator(false);
    setNewAccountName("");
    setFeedback(`Cuenta de ${account.name} abierta para esta mesa.`);
  };

  const confirmAction = () => {
    if (!activeAction) return;

    if (activeAction === "charge") {
      markOrdersPaid(pendingOrders.map((order) => order.id));
      updateTable(table.id, (current) => ({ ...current, balance: 0 }));
      setFeedback("Cobro registrado. La mesa ya puede liberarse.");
    } else if (activeAction === "release") {
      clearTableAccounts(tableSource);
      updateTable(table.id, (current) => ({
        ...current,
        status: "free",
        guests: 0,
        balance: 0,
        orderId: undefined,
        elapsed: undefined,
        openedAt: undefined,
        responsible: undefined,
      }));
      setFeedback("Mesa liberada correctamente.");
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
          <strong>
            {pendingOrders.length > 0
              ? pendingOrders.map((order) => `#${order.id}`).join(", ")
              : table.orderId
                ? `#${table.orderId}`
                : "Sin pedido"}
          </strong>
        </div>
        <div>
          <span>Saldo pendiente</span>
          <strong className={pendingTotal > 0 ? "text-danger" : "text-success"}>
            {money.format(pendingTotal)}
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
                : `Al abrirla quedará asignada automáticamente a ${currentOperationalUser}.`}
            </p>
          </div>
          <div className="table-available-state__actions">
            {isAvailable ? (
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
              onClick={openTable}
              type="button"
            >
              <Plus aria-hidden="true" size={18} />
              {isReserved ? "Recibir reserva" : "Abrir mesa"}
            </button>
          </div>
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
                : "Este estado fue establecido manualmente y requiere personal autorizado para habilitarla."}
            </p>
            {table.manualStatus ? (
              <div className="table-status-audit">
                <strong>
                  {table.manualStatus.channel} · {table.manualStatus.setBy} ·{" "}
                  {table.manualStatus.time}
                </strong>
                <span>{table.manualStatus.reason}</span>
              </div>
            ) : null}
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
                <h2 id="account-title">Cuentas de la mesa</h2>
                <p>
                  {openAccounts.length} cuenta(s) · {productCount} productos ·{" "}
                  {pendingOrders.length || (table.orderId ? 1 : 0)} comanda(s)
                </p>
              </div>
              <button
                className="button button--primary button--compact"
                onClick={() => setShowAccountCreator(true)}
                type="button"
              >
                <Plus aria-hidden="true" size={17} /> Abrir cuenta
              </button>
            </div>

            {openAccounts.length > 0 ? (
              <div className="table-open-accounts">
                {openAccounts.map((account) => {
                  const accountOrders = pendingOrders.filter(
                    (order) => order.accountId === account.id,
                  );
                  const accountTotal = accountOrders.reduce(
                    (total, order) => total + getOrderTotal(order.items),
                    0,
                  );
                  return (
                    <article key={account.id}>
                      <div>
                        <UserRound aria-hidden="true" size={17} />
                        <span>
                          <strong>{account.name}</strong>
                          <small>
                            {accountOrders.length
                              ? `${accountOrders.length} comanda(s)`
                              : "Lista para agregar productos"}
                          </small>
                        </span>
                      </div>
                      <strong>{money.format(accountTotal)}</strong>
                      <Link
                        className="button button--secondary button--compact"
                        href={`/operation/orders/new?table=${table.number}&account=${encodeURIComponent(account.id)}&accountName=${encodeURIComponent(account.name)}`}
                      >
                        <Plus aria-hidden="true" size={15} /> Agregar productos
                      </Link>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="table-account-onboarding">
                <UserRound aria-hidden="true" size={21} />
                <div>
                  <strong>Abre la primera cuenta</strong>
                  <span>
                    Así cada comanda quedará asociada a la persona que la pidió.
                  </span>
                </div>
              </div>
            )}

            <div className="table-account-subheading">
              <strong>Resumen pendiente</strong>
              <span>Todos los productos de la atención</span>
            </div>

            <div className="table-order-list">
              {accountLines.length > 0 ? (
                accountLines.map((line) => (
                  <article className="table-order-row" key={line.key}>
                    <strong>{line.item.quantity}</strong>
                    <div>
                      <span>{line.item.name}</span>
                      <small>
                        {[
                          line.orderId ? `#${line.orderId}` : null,
                          ...line.item.modifiers,
                          line.item.notes,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                      {line.item.fulfillment === "takeaway" ? (
                        <small className="table-order-row__takeaway">
                          <Package aria-hidden="true" size={12} /> Para llevar
                          {line.item.readyAt ? ` · ${line.item.readyAt}` : ""}
                        </small>
                      ) : null}
                    </div>
                    <span>
                      {money.format(line.item.quantity * line.item.unitPrice)}
                    </span>
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
              <strong>{money.format(pendingTotal)}</strong>
            </div>
          </section>

          <aside className="table-detail__side">
            <section className="ops-work-panel">
              <div className="ops-section-heading ops-section-heading--compact">
                <div>
                  <h2>Responsable</h2>
                  <p>Usuario que abrió la mesa</p>
                </div>
                <UserRound aria-hidden="true" size={19} />
              </div>
              <div className="table-owner">
                <UserRound aria-hidden="true" size={18} />
                <div>
                  <strong>{table.responsible ?? "Sin asignar"}</strong>
                  <span>Asignación automática de apertura</span>
                </div>
              </div>
            </section>

            <section
              className="ops-work-panel table-actions"
              aria-labelledby="actions-title"
            >
              <div className="ops-section-heading ops-section-heading--compact">
                <div>
                  <h2 id="actions-title">Acciones de cuenta</h2>
                  <p>Mockups sujetos a revisión</p>
                </div>
              </div>
              <button
                disabled
                title="Se implementará después del flujo de cuentas"
                type="button"
              >
                <Split aria-hidden="true" size={18} /> Dividir cuenta ·
                pendiente
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
              {pendingTotal > 0 ? (
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
        Datos y permisos simulados. Las cuentas se conservan al navegar;
        división posterior, cobro, precuenta y traslado se completarán en sus
        módulos definitivos.
      </p>

      {showReservationPicker ? (
        <div className="confirm-dialog__backdrop" role="presentation">
          <section
            aria-labelledby="reservation-picker-title"
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
            <h2 id="reservation-picker-title">Reservaciones de hoy</h2>
            <p>
              Selecciona una reservación compatible con la capacidad de esta
              mesa.
            </p>
            <div className="reservation-picker__list">
              {operationalReservationsToday.map((reservation) => {
                const compatible = reservation.people <= table.capacity;
                return (
                  <label
                    className={compatible ? "" : "is-disabled"}
                    key={reservation.id}
                  >
                    <input
                      checked={selectedReservationId === reservation.id}
                      disabled={!compatible}
                      name="reservation"
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
                Asignar a mesa {table.number}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {showAccountCreator ? (
        <div className="confirm-dialog__backdrop" role="presentation">
          <section
            aria-labelledby="create-account-title"
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
              <UserRound aria-hidden="true" size={22} />
            </span>
            <h2 id="create-account-title">Abrir cuenta</h2>
            <p>
              Identifica a la persona para asociar sus comandas y productos.
            </p>
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
                Abrir cuenta
              </button>
            </div>
          </section>
        </div>
      ) : null}

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
                {money.format(pendingTotal)}
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
