"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { useProductionSession } from "../production-session-provider";

export function ProductionSuggestionView({ suggestionId }: { suggestionId: string }) {
  const { suggestions, actOnSuggestion } = useProductionSession();
  const suggestion = suggestions.find((s) => s.id === suggestionId);
  const [feedback, setFeedback] = useState("");

  if (!suggestion) {
    return (
      <div className="production-page">
        <Link className="text-action" href="/operation/production">
          <ArrowLeft aria-hidden="true" size={16} /> Volver a producción
        </Link>
        <div className="ops-empty-state order-not-found">
          <strong>Esta sugerencia no está disponible</strong>
          <span>Puede haberse reiniciado al recargar los datos simulados.</span>
        </div>
      </div>
    );
  }

  const isPending = suggestion.status === "pending";
  const priorityMeta = {
    high: { label: "Alta", tone: "danger" as const },
    medium: { label: "Media", tone: "warning" as const },
    low: { label: "Baja", tone: "info" as const },
  }[suggestion.priority];

  return (
    <div className="production-page production-suggestion-detail">
      <header className="ops-page-header">
        <div>
          <Link className="text-action" href="/operation/production">
            <ArrowLeft aria-hidden="true" size={16} /> Volver a producción
          </Link>
          <span className="ops-kicker">Sugerencia de producción</span>
          <h1>{suggestion.recipeName}</h1>
          <p>{suggestion.category} · Creada {suggestion.createdAt}</p>
        </div>
        <span
          className={`production-suggestion-badge production-suggestion-badge--${priorityMeta.tone}`}
        >
          Prioridad {priorityMeta.label}
        </span>
      </header>

      {feedback && (
        <div className="ops-inline-feedback" role="status">
          <CheckCircle2 aria-hidden="true" size={18} /> {feedback}
        </div>
      )}

      <section className="production-suggestion-card" aria-label="Detalle de la sugerencia">
        <div className="production-suggestion-card__reason">
          <AlertTriangle aria-hidden="true" className="ops-heading-icon" size={22} />
          <div>
            <span>Motivo</span>
            <strong>{suggestion.reason}</strong>
          </div>
        </div>
        <div className="production-suggestion-card__quantity">
          <span>Cantidad sugerida</span>
          <strong>
            {suggestion.suggestedQuantity} {suggestion.unit}
          </strong>
        </div>
      </section>

      <section className="production-suggestion-status" aria-label="Estado">
        <span>Estado actual</span>
        <strong>
          {suggestion.status === "pending"
            ? "Pendiente de revisión"
            : suggestion.status === "accepted"
              ? "Aceptada"
              : "Rechazada"}
        </strong>
      </section>

      {isPending && (
        <div className="production-suggestion-actions">
          <button
            className="button button--success button--full"
            onClick={() => {
              actOnSuggestion({ suggestionId: suggestion.id, action: "accept" });
              setFeedback("Sugerencia aceptada. Se generó un batch sugerido.");
            }}
            type="button"
          >
            <CheckCircle2 aria-hidden="true" size={18} /> Aceptar sugerencia
          </button>
          <button
            className="button button--danger button--full"
            onClick={() => {
              actOnSuggestion({ suggestionId: suggestion.id, action: "reject" });
              setFeedback("Sugerencia rechazada.");
            }}
            type="button"
          >
            <X aria-hidden="true" size={18} /> Rechazar sugerencia
          </button>
        </div>
      )}

      {!isPending && (
        <p className="mock-disclaimer">
          Esta sugerencia ya fue revisada y no admite más acciones.
        </p>
      )}

      <p className="mock-disclaimer">
        Las decisiones cambian únicamente el estado local hasta integrar backend.
      </p>
    </div>
  );
}