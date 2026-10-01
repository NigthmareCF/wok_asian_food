"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Bike,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  HandPlatter,
  Package,
  RefreshCw,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";
import {
  type OnlineRequestKind,
  type OnlineRequestStatus,
} from "@/data/fixtures/messaging";
import { currentOperationalUser } from "@/data/fixtures/operation";
import { useOrderSession } from "@/modules/orders";
import { useDeliverySession } from "@/modules/delivery";
import { useReservationSession } from "@/modules/reservations";
import { useTableSession } from "@/modules/tables";
import { useServiceStatus } from "@/modules/service-status";
import { useMessagingSession } from "../messaging-session-provider";
import {
  evaluateOnlineRequestRules,
  getAvailableTableForRequest,
  getOnlineRequestIssueMessage,
  noProcedeMessage,
  onlineRequestIssueLabel,
} from "../online-request-rules";
import styles from "./messaging.module.css";

const money = new Intl.NumberFormat("es-GT", {
  style: "currency",
  currency: "GTQ",
});

const requestMeta: Record<
  OnlineRequestStatus,
  { label: string; tone: string; icon: typeof Clock3 }
> = {
  pending: { label: "Pendiente", tone: "warning", icon: Clock3 },
  outdated: { label: "Desactualizada", tone: "danger", icon: RefreshCw },
  accepted: { label: "Aceptada", tone: "success", icon: CheckCircle2 },
  rejected: { label: "Rechazada", tone: "neutral", icon: XCircle },
};

const kindMeta: Record<
  OnlineRequestKind,
  { label: string; tone: string; icon: typeof Bike }
> = {
  delivery: { label: "Delivery", tone: "info", icon: Bike },
  pickup: { label: "Para recoger", tone: "warning", icon: Package },
  "dine-in": { label: "Comer en sala", tone: "success", icon: HandPlatter },
  reservation: { label: "Reservación", tone: "neutral", icon: CalendarClock },
};

const kindFilters: { value: "all" | OnlineRequestKind; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "delivery", label: "Delivery" },
  { value: "pickup", label: "Para recoger" },
  { value: "dine-in", label: "Comer en sala" },
  { value: "reservation", label: "Reservación" },
];

function RequestStatusLabel({ status }: { status: OnlineRequestStatus }) {
  const meta = requestMeta[status];
  const StatusIcon = meta.icon;

  return (
    <span className={`${styles.requestStatus} ${styles[`tone_${meta.tone}`]}`}>
      <StatusIcon aria-hidden="true" size={14} />
      {meta.label}
    </span>
  );
}

function RequestKindLabel({ kind }: { kind: OnlineRequestKind }) {
  const meta = kindMeta[kind];
  const KindIcon = meta.icon;

  return (
    <span className={`${styles.requestKind} ${styles[`tone_${meta.tone}`]}`}>
      <KindIcon aria-hidden="true" size={13} />
      {meta.label}
    </span>
  );
}

export function OnlineRequestsView() {
  const { createReservation } = useReservationSession();
  const { createDeliveryOrder } = useDeliverySession();
  const { createOrder } = useOrderSession();
  const { joinedGroups, tables, updateTable } = useTableSession();
  const { service } = useServiceStatus();
  const { onlineRequests, updateOnlineRequest } = useMessagingSession();
  const [selectedId, setSelectedId] = useState(onlineRequests[0]?.id ?? "");
  const [kindFilter, setKindFilter] = useState<"all" | OnlineRequestKind>(
    "all",
  );
  const [rejectionReason, setRejectionReason] = useState("");
  const [feedback, setFeedback] = useState("");
  const selected = onlineRequests.find((request) => request.id === selectedId);
  const visible = onlineRequests.filter(
    (request) => kindFilter === "all" || request.kind === kindFilter,
  );

  const joinedTableIds = useMemo(
    () => new Set(joinedGroups.flatMap((group) => group.tableIds)),
    [joinedGroups],
  );
  const availableTables = useMemo(
    () => tables.filter((table) => !joinedTableIds.has(table.id)),
    [tables, joinedTableIds],
  );

  const rules = selected
    ? evaluateOnlineRequestRules(selected, {
        serviceStatus: service.currentStatus,
        tables: availableTables,
      })
    : { blocked: [], warnings: [] };
  const canAccept =
    Boolean(selected) &&
    rules.blocked.length === 0 &&
    (selected?.status === "pending" || selected?.status === "outdated");

  const items = (selected?.items ?? []).map((item) => ({
    id: item.id,
    productId: item.id,
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    modifiers: item.modifiers ?? [],
  }));

  const acceptRequest = () => {
    if (!selected || rules.blocked.length > 0) return;
    if (selected.status !== "pending") return;

    if (selected.kind === "reservation") {
      const reservationId = createReservation({
        date: selected.date,
        guest: selected.customer,
        note: selected.note,
        people: selected.people,
        phone: selected.phone,
        preorder: selected.preorder,
        source: "online",
        status: selected.preorder ? "preorder" : "confirmed",
        time: selected.time,
      });
      updateOnlineRequest(selected.id, "accepted");
      setFeedback(`Solicitud aceptada y convertida en ${reservationId}.`);
      return;
    }

    if (selected.kind === "dine-in") {
      const target = getAvailableTableForRequest(selected, availableTables);
      if (!target) return;
      const orderId = createOrder({
        channel: "table",
        source: `Mesa ${target.number}`,
        items: items.map((item) => ({ ...item, fulfillment: "dine-in" })),
      });
      updateTable(target.id, (current) => ({
        ...current,
        status: "occupied",
        guests: Math.max(selected.people, 1),
        responsible: currentOperationalUser,
        openedAt: "Ahora",
        elapsed: "0 min",
        orderId,
      }));
      updateOnlineRequest(selected.id, "accepted");
      setFeedback(
        `Solicitud aceptada: pedido ${orderId} vinculado a la mesa ${target.number}.`,
      );
      return;
    }

    const channel = selected.kind === "delivery" ? "delivery" : "pickup";
    const orderItems = items.map((item) => ({
      ...item,
      fulfillment: "takeaway" as const,
    }));
    const orderId = createOrder({
      channel,
      source: `${selected.kind === "delivery" ? "Delivery" : "Recoger"} · ${selected.customer}`,
      items: orderItems,
    });
    let deliveryLink = "";
    if (selected.kind === "delivery") {
      const deliveryId = createDeliveryOrder({
        customer: selected.customer,
        address: selected.address ?? "",
        phone: selected.phone,
        items: orderItems,
        paymentMethod: "cash",
        notes: selected.note,
      });
      deliveryLink = ` y entrega ${deliveryId}`;
    }
    updateOnlineRequest(selected.id, "accepted");
    setFeedback(
      `Pedido ${orderId} aceptado${deliveryLink}; vinculado a Delivery y a Pagos.`,
    );
  };

  return (
    <div className={styles.page}>
      <header className={`ops-page-header ${styles.header}`}>
        <div>
          <Link className="text-action" href="/operation/messages">
            <ArrowLeft aria-hidden="true" size={16} /> Volver a mensajes
          </Link>
          <span className="ops-kicker">Revisión humana</span>
          <h1>Solicitudes en línea</h1>
          <p>
            Revalida modalidad, horario y disponibilidad antes de aceptar
            solicitudes remotas.
          </p>
        </div>
      </header>

      {feedback ? (
        <div className="ops-inline-feedback" role="status">
          <Check aria-hidden="true" size={18} /> {feedback}
        </div>
      ) : null}

      <section className={styles.priorityNotice}>
        <ShieldCheck aria-hidden="true" size={19} />
        <div>
          <strong>Prioridad operativa</strong>
          <span>
            La atención presencial tiene prioridad sobre solicitudes remotas
            pendientes.
          </span>
        </div>
      </section>

      <div className={styles.filters} aria-label="Filtrar por modalidad">
        {kindFilters.map((item) => {
          const count =
            item.value === "all"
              ? onlineRequests.length
              : onlineRequests.filter(
                  (request) => request.kind === item.value,
                ).length;
          return (
            <button
              aria-pressed={kindFilter === item.value}
              key={item.value}
              onClick={() => setKindFilter(item.value)}
              type="button"
            >
              {item.label} <small>{count}</small>
            </button>
          );
        })}
      </div>

      <div className={styles.requestsLayout}>
        <section
          className={styles.requestList}
          aria-label="Solicitudes recibidas"
        >
          {visible.map((request) => {
            const meta = kindMeta[request.kind];
            const MetaIcon = meta.icon;
            return (
              <button
                aria-pressed={selected?.id === request.id}
                key={request.id}
                onClick={() => {
                  setSelectedId(request.id);
                  setFeedback("");
                  setRejectionReason("");
                }}
                type="button"
              >
                <span>
                  <strong>{request.customer}</strong>
                  <small>
                    <MetaIcon aria-hidden="true" size={12} />
                    {meta.label} · {request.requestedAt}
                  </small>
                </span>
                <RequestStatusLabel status={request.status} />
                <small>
                  {request.date} · {request.time}
                </small>
              </button>
            );
          })}
        </section>

        {selected ? (
          <aside className={styles.requestDetail}>
            <header>
              <div>
                <span>Solicitud #{selected.id}</span>
                <h2>{selected.customer}</h2>
                <small>{selected.phone}</small>
              </div>
              <div className={styles.requestHeaderTags}>
                <RequestKindLabel kind={selected.kind} />
                <RequestStatusLabel status={selected.status} />
              </div>
            </header>

            <dl>
              <div>
                <dt>Modalidad</dt>
                <dd>{kindMeta[selected.kind].label}</dd>
              </div>
              <div>
                <dt>Fecha</dt>
                <dd>{selected.date}</dd>
              </div>
              <div>
                <dt>Hora</dt>
                <dd>{selected.time}</dd>
              </div>
              <div>
                <dt>Personas</dt>
                <dd>
                  {selected.people > 0 ? selected.people : "No aplica"}
                </dd>
              </div>
              {selected.kind === "delivery" ? (
                <div>
                  <dt>Dirección</dt>
                  <dd>{selected.address ?? "Sin dirección"}</dd>
                </div>
              ) : null}
              {selected.total != null && selected.kind !== "reservation" ? (
                <div>
                  <dt>Monto estimado</dt>
                  <dd>{money.format(selected.total)}</dd>
                </div>
              ) : null}
              <div>
                <dt>Última validación</dt>
                <dd>{selected.lastValidatedAt}</dd>
              </div>
              <div>
                <dt>Nota</dt>
                <dd>{selected.note ?? "Sin indicaciones"}</dd>
              </div>
            </dl>

            {selected.items && selected.items.length > 0 ? (
              <div className={styles.requestItems}>
                <strong>Productos solicitados</strong>
                {selected.items.map((item) => (
                  <div key={item.id}>
                    <span>
                      {item.quantity}× {item.name}
                      {item.modifiers && item.modifiers.length > 0
                        ? ` · ${item.modifiers.join(", ")}`
                        : ""}
                    </span>
                    <strong>{money.format(item.quantity * item.unitPrice)}</strong>
                  </div>
                ))}
              </div>
            ) : null}

            {rules.blocked.length > 0 ? (
              <div className={styles.notFeasible} role="alert">
                <CircleAlert aria-hidden="true" size={18} />
                <div>
                  <strong>No procede según las reglas actuales</strong>
                  <ul>
                    {rules.blocked.map((issue) => (
                      <li key={issue}>
                        <b>{onlineRequestIssueLabel[issue]}:</b>{" "}
                        {getOnlineRequestIssueMessage(issue)}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <>
                {rules.warnings.length > 0 ? (
                  <div className={styles.highDemandWarning} role="status">
                    <Clock3 aria-hidden="true" size={18} />
                    <span>
                      {rules.warnings
                        .map((issue) => getOnlineRequestIssueMessage(issue))
                        .join(" ")}
                    </span>
                  </div>
                ) : null}
                {selected.status === "outdated" ? (
                  <div className={styles.staleWarning} role="alert">
                    <CircleAlert aria-hidden="true" size={18} />
                    <span>
                      La disponibilidad cambió. Revalida antes de aceptar.
                    </span>
                  </div>
                ) : null}
              </>
            )}

            {selected.status === "pending" || selected.status === "outdated" ? (
              <div className={styles.requestActions}>
                {selected.status === "outdated" ? (
                  <button
                    className="button button--primary"
                    onClick={() => {
                      updateOnlineRequest(selected.id, "pending");
                      setFeedback(
                        "Disponibilidad revalidada; ya puede aceptarse.",
                      );
                    }}
                    type="button"
                  >
                    <RefreshCw aria-hidden="true" size={17} /> Revalidar
                  </button>
                ) : (
                  <button
                    className="button button--primary"
                    disabled={rules.blocked.length > 0}
                    onClick={acceptRequest}
                    type="button"
                  >
                    <Check aria-hidden="true" size={17} />
                    {selected.kind === "delivery"
                      ? "Aceptar y crear delivery"
                      : selected.kind === "pickup"
                        ? "Aceptar y crear pedido"
                        : selected.kind === "dine-in"
                          ? "Asignar mesa y aceptar"
                          : "Aceptar solicitud"}
                  </button>
                )}
                <button
                  className="button button--secondary"
                  onClick={() =>
                    setFeedback("Solicitud mantenida en espera.")
                  }
                  type="button"
                >
                  <Clock3 aria-hidden="true" size={17} /> Mantener pendiente
                </button>
                {rules.blocked.length > 0 ? (
                  <button
                    className="button button--danger"
                    onClick={() => {
                      updateOnlineRequest(
                        selected.id,
                        "rejected",
                        noProcedeMessage,
                      );
                      setFeedback(
                        `Solicitud rechazada por no proceder: se registró el motivo.`,
                      );
                    }}
                    type="button"
                  >
                    <XCircle aria-hidden="true" size={17} /> Rechazar (no
                    procede)
                  </button>
                ) : (
                  <label className="order-field">
                    <span>Motivo de rechazo</span>
                    <select
                      onChange={(event) =>
                        setRejectionReason(event.target.value)
                      }
                      value={rejectionReason}
                    >
                      <option value="">Seleccionar motivo</option>
                      <option value="Sin disponibilidad">
                        Sin disponibilidad
                      </option>
                      <option value="Horario no disponible">
                        Horario no disponible
                      </option>
                      <option value="Datos incompletos">
                        Datos incompletos
                      </option>
                    </select>
                  </label>
                )}
                {rules.blocked.length === 0 ? (
                  <button
                    className="button button--danger"
                    disabled={!rejectionReason}
                    onClick={() => {
                      updateOnlineRequest(
                        selected.id,
                        "rejected",
                        rejectionReason,
                      );
                      setFeedback(`Solicitud rechazada: ${rejectionReason}.`);
                    }}
                    type="button"
                  >
                    <X aria-hidden="true" size={17} /> Rechazar
                  </button>
                ) : null}
              </div>
            ) : null}
            {selected.rejectionReason ? (
              <p className={styles.rejection}>
                Motivo: {selected.rejectionReason}
              </p>
            ) : null}
          </aside>
        ) : null}
      </div>

      <p className="mock-disclaimer">
        Toda aceptación requiere revalidación final y autorización del backend.
        Las reglas usan horario (11:00–22:00), estado del servicio y
        disponibilidad de mesas.
      </p>
    </div>
  );
}