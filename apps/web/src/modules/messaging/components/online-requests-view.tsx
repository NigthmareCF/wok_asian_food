"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  RefreshCw,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";
import type { OnlineRequestStatus } from "@/data/fixtures/messaging";
import { useReservationSession } from "@/modules/reservations";
import { useMessagingSession } from "../messaging-session-provider";
import styles from "./messaging.module.css";

type RequestFilter = "all" | OnlineRequestStatus;

const requestMeta: Record<
  OnlineRequestStatus,
  { label: string; tone: string; icon: typeof Clock3 }
> = {
  pending: { label: "Pendiente", tone: "warning", icon: Clock3 },
  outdated: { label: "Desactualizada", tone: "danger", icon: RefreshCw },
  accepted: { label: "Aceptada", tone: "success", icon: CheckCircle2 },
  rejected: { label: "Rechazada", tone: "neutral", icon: XCircle },
};

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

export function OnlineRequestsView() {
  const { createReservation } = useReservationSession();
  const { onlineRequests, updateOnlineRequest } = useMessagingSession();
  const [selectedId, setSelectedId] = useState(onlineRequests[0]?.id ?? "");
  const [filter, setFilter] = useState<RequestFilter>("all");
  const [rejectionReason, setRejectionReason] = useState("");
  const [feedback, setFeedback] = useState("");
  const selected = onlineRequests.find((request) => request.id === selectedId);
  const visible = onlineRequests.filter(
    (request) => filter === "all" || request.status === filter,
  );

  const acceptRequest = () => {
    if (!selected || selected.status !== "pending") return;
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
          <p>Revalida disponibilidad antes de aceptar solicitudes remotas.</p>
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

      <div className={styles.filters} aria-label="Filtrar solicitudes">
        <button
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
          type="button"
        >
          Todas <small>{onlineRequests.length}</small>
        </button>
        {(Object.keys(requestMeta) as OnlineRequestStatus[]).map((status) => {
          const StatusIcon = requestMeta[status].icon;
          return (
            <button
              aria-pressed={filter === status}
              key={status}
              onClick={() => setFilter(status)}
              type="button"
            >
              <StatusIcon aria-hidden="true" size={14} />
              {requestMeta[status].label}
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
                    {request.requestedAt} · {request.people} personas
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
              <RequestStatusLabel status={selected.status} />
            </header>
            <dl>
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
                <dd>{selected.people}</dd>
              </div>
              <div>
                <dt>Preorden</dt>
                <dd>{selected.preorder ? "Sí" : "No"}</dd>
              </div>
              <div>
                <dt>Última validación</dt>
                <dd>{selected.lastValidatedAt}</dd>
              </div>
              <div>
                <dt>Nota</dt>
                <dd>{selected.note ?? "Sin indicaciones"}</dd>
              </div>
            </dl>

            {selected.status === "outdated" ? (
              <div className={styles.staleWarning} role="alert">
                <CircleAlert aria-hidden="true" size={18} />
                <span>
                  La disponibilidad cambió. Revalida antes de aceptar.
                </span>
              </div>
            ) : null}

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
                    onClick={acceptRequest}
                    type="button"
                  >
                    <Check aria-hidden="true" size={17} /> Aceptar solicitud
                  </button>
                )}
                <button
                  className="button button--secondary"
                  onClick={() => setFeedback("Solicitud mantenida en espera.")}
                  type="button"
                >
                  <Clock3 aria-hidden="true" size={17} /> Mantener pendiente
                </button>
                <label className="order-field">
                  <span>Motivo de rechazo</span>
                  <select
                    onChange={(event) => setRejectionReason(event.target.value)}
                    value={rejectionReason}
                  >
                    <option value="">Seleccionar motivo</option>
                    <option value="Sin disponibilidad">
                      Sin disponibilidad
                    </option>
                    <option value="Horario no disponible">
                      Horario no disponible
                    </option>
                    <option value="Datos incompletos">Datos incompletos</option>
                  </select>
                </label>
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
      </p>
    </div>
  );
}
