"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Check,
  History,
  Package,
  X,
  XCircle,
} from "lucide-react";
import {
  serviceStatusOptions,
  type ServiceStatusValue,
} from "@/data/fixtures/production";
import { useServiceStatus } from "../service-status-provider";

const statusIcons: Record<ServiceStatusValue, typeof CheckCircle2> = {
  normal: CheckCircle2,
  "high-demand": AlertTriangle,
  "pickup-only": Package,
  suspended: XCircle,
};

const statusToneLabel: Record<
  ServiceStatusValue,
  "success" | "warning" | "info" | "danger"
> = {
  normal: "success",
  "high-demand": "warning",
  "pickup-only": "info",
  suspended: "danger",
};

export function ServiceStatusView() {
  const { service, setStatus } = useServiceStatus();
  const [reason, setReason] = useState("");
  const [candidate, setCandidate] = useState<ServiceStatusValue | null>(null);
  const [feedback, setFeedback] = useState("");

  const currentMeta = serviceStatusOptions.find(
    (s) => s.value === service.currentStatus,
  );
  const CurrentIcon = statusIcons[service.currentStatus];
  const currentTone = statusToneLabel[service.currentStatus];

  const handleConfirm = () => {
    if (!candidate || !reason.trim()) return;
    const target = serviceStatusOptions.find((s) => s.value === candidate);
    const result = setStatus({ status: candidate, reason });
    if (result) {
      setFeedback(
        `Estado del servicio cambiado a "${target?.label}". ${reason}`,
      );
      setCandidate(null);
      setReason("");
    }
  };

  return (
    <div className="status-page">
      <header className="ops-page-header status-page__header">
        <div>
          <Link className="text-action" href="/operation">
            <ArrowLeft aria-hidden="true" size={16} /> Volver a operación
          </Link>
          <span className="ops-kicker">Estado del servicio</span>
          <h1>Estado actual</h1>
          <p>
            Controla el estado operativo visible para clientes y personal.
          </p>
        </div>
        <span
          className={`ops-service-status ops-service-status--${currentTone}`}
        >
          <CurrentIcon aria-hidden="true" size={18} /> {currentMeta?.label}
        </span>
      </header>

      {feedback && (
        <div className="ops-inline-feedback" role="status">
          <CheckCircle2 aria-hidden="true" size={18} /> {feedback}
        </div>
      )}

      <section
        className="status-current-strip"
        aria-label="Resumen del estado actual"
      >
        <CurrentIcon aria-hidden="true" size={21} />
        <div>
          <strong>{currentMeta?.label}</strong>
          <span>{currentMeta?.description}</span>
        </div>
        <div>
          <span>Motivo</span>
          <strong>{service.reason}</strong>
        </div>
        <div>
          <span>Cambiado por</span>
          <strong>{service.changedBy} · {service.changedAt}</strong>
        </div>
      </section>

      <section className="status-selector" aria-labelledby="status-selector-title">
        <div className="ops-section-heading">
          <div>
            <h2 id="status-selector-title">Cambiar estado</h2>
            <p>Selecciona un estado y registra el motivo del cambio</p>
          </div>
        </div>

        <div className="status-options">
          {serviceStatusOptions.map((option) => {
            const Icon = statusIcons[option.value];
            const isCurrent = option.value === service.currentStatus;
            const isSelected = candidate === option.value;
            return (
              <button
                aria-pressed={isSelected || isCurrent}
                className={`status-option status-option--${option.tone} ${
                  isCurrent ? "status-option--current" : ""
                } ${isSelected ? "status-option--selected" : ""}`}
                key={option.value}
                onClick={() => {
                  setCandidate(option.value);
                  setReason("");
                }}
                type="button"
              >
                <span className="status-option__icon">
                  <Icon aria-hidden="true" size={22} />
                </span>
                <div>
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </div>
                {isCurrent && (
                  <span className="status-option__current-tag">Actual</span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="status-actions" aria-labelledby="status-actions-title">
        <div className="ops-section-heading">
          <div>
            <h2 id="status-actions-title">Aplicar cambio</h2>
            <p>Registra el motivo para cambiar el estado</p>
          </div>
        </div>

        {candidate ? (
          <div className="status-apply">
            <label className="cash-field">
              <span>Motivo del cambio *</span>
              <input
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej. Personal reducido, fallo en cocina..."
                type="text"
                value={reason}
              />
            </label>
            <button
              className="button button--primary button--full"
              disabled={!reason.trim()}
              onClick={handleConfirm}
              type="button"
            >
              <Check aria-hidden="true" size={18} /> Confirmar cambio de estado
            </button>
          </div>
        ) : (
          <div className="ops-empty-state">
            <strong>Selecciona un estado de arriba</strong>
            <span>El botón de confirmación aparecerá aquí.</span>
          </div>
        )}
      </section>

      <section className="status-history" aria-labelledby="history-title">
        <div className="ops-section-heading">
          <div>
            <h2 id="history-title">Historial de cambios</h2>
            <p>Últimos cambios de estado del servicio</p>
          </div>
        </div>
        <div className="status-history-list">
          {service.history.map((entry, index) => {
            const meta = serviceStatusOptions.find(
              (s) => s.value === entry.status,
            );
            const Icon = statusIcons[entry.status];
            const tone = statusToneLabel[entry.status];
            return (
              <div className="status-history-item" key={index}>
                <span
                  className={`status-history-item__icon status-history-item__icon--${tone}`}
                >
                  <Icon aria-hidden="true" size={17} />
                </span>
                <div className="status-history-item__info">
                  <strong>{meta?.label}</strong>
                  <span>{entry.reason}</span>
                </div>
                <div className="status-history-item__meta">
                  <span>{entry.changedAt}</span>
                  <span>Por {entry.changedBy}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <p className="mock-disclaimer">
        Los datos de estado del servicio son simulados; se reinician al recargar.
      </p>
    </div>
  );
}