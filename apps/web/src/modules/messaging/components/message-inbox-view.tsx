"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Bot,
  Check,
  CircleAlert,
  MessageSquareText,
  Send,
  UserCheck,
} from "lucide-react";
import { type ConversationStatus } from "@/data/fixtures/messaging";
import { useMessagingSession } from "../messaging-session-provider";
import styles from "./messaging.module.css";

type ConversationFilter = "all" | ConversationStatus;

const statusMeta: Record<ConversationStatus, { label: string; tone: string }> =
  {
    unassigned: { label: "Sin asignar", tone: "neutral" },
    ai: { label: "Atiende IA", tone: "info" },
    human: { label: "Atiende persona", tone: "success" },
    attention: { label: "Requiere atención", tone: "danger" },
  };

const channelLabels = {
  whatsapp: "WhatsApp",
  web: "Web",
  instagram: "Instagram",
};

export function MessageInboxView() {
  const {
    conversations,
    replyToConversation,
    takeConversation,
    transferConversation,
  } = useMessagingSession();
  const [selectedId, setSelectedId] = useState("CONV-31");
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [reply, setReply] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [feedback, setFeedback] = useState("");
  const selected =
    conversations.find((conversation) => conversation.id === selectedId) ??
    conversations[0];
  const visible = conversations.filter(
    (conversation) => filter === "all" || conversation.status === filter,
  );

  const sendReply = () => {
    if (!selected || !reply.trim() || selected.status !== "human") return;
    replyToConversation(selected.id, reply.trim());
    setReply("");
    setFeedback("Respuesta enviada en el canal simulado.");
  };

  return (
    <div className={styles.page}>
      <header className="ops-page-header">
        <div>
          <span className="ops-kicker">Bandeja omnicanal</span>
          <h1>Mensajes</h1>
          <p>
            Toma conversaciones, responde y consulta el contexto del cliente.
          </p>
        </div>
        <Link
          className="button button--secondary"
          href="/operation/online-requests"
        >
          <CircleAlert aria-hidden="true" size={17} /> Solicitudes en línea
        </Link>
      </header>

      {feedback ? (
        <div className="ops-inline-feedback" role="status">
          <Check aria-hidden="true" size={18} /> {feedback}
        </div>
      ) : null}

      <div className={styles.filters} aria-label="Filtrar conversaciones">
        <button
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
          type="button"
        >
          Todas <small>{conversations.length}</small>
        </button>
        {(Object.keys(statusMeta) as ConversationStatus[]).map((status) => (
          <button
            aria-pressed={filter === status}
            key={status}
            onClick={() => setFilter(status)}
            type="button"
          >
            {statusMeta[status].label}
          </button>
        ))}
      </div>

      <div className={styles.inboxLayout}>
        <aside className={styles.inbox} aria-label="Conversaciones">
          <header>
            <span>Conversaciones</span>
            <strong>{visible.length}</strong>
          </header>
          <div>
            {visible.map((conversation) => {
              const meta = statusMeta[conversation.status];
              return (
                <button
                  aria-pressed={selected?.id === conversation.id}
                  key={conversation.id}
                  onClick={() => {
                    setSelectedId(conversation.id);
                    setFeedback("");
                  }}
                  type="button"
                >
                  <span className={styles.avatar}>
                    {conversation.customer.slice(0, 1)}
                  </span>
                  <span className={styles.conversationCopy}>
                    <strong>{conversation.customer}</strong>
                    <small>
                      {channelLabels[conversation.channel]} ·{" "}
                      {conversation.lastAt}
                    </small>
                    <span>{conversation.preview}</span>
                    <small className={styles[`tone_${meta.tone}`]}>
                      {meta.label}
                    </small>
                  </span>
                  {conversation.unread ? <b>{conversation.unread}</b> : null}
                </button>
              );
            })}
          </div>
        </aside>

        {selected ? (
          <main
            className={styles.chat}
            aria-label={`Conversación con ${selected.customer}`}
          >
            <header>
              <div>
                <strong>{selected.customer}</strong>
                <span>
                  {channelLabels[selected.channel]} ·{" "}
                  {selected.assignedTo ?? "Sin asignar"}
                </span>
              </div>
              {selected.status !== "human" ? (
                <button
                  className="button button--primary button--compact"
                  onClick={() => {
                    takeConversation(selected.id);
                    setFeedback(`Conversación asignada a Antony.`);
                  }}
                  type="button"
                >
                  <UserCheck aria-hidden="true" size={16} /> Tomar conversación
                </button>
              ) : (
                <span className={styles.assigned}>
                  <UserCheck aria-hidden="true" size={15} />{" "}
                  {selected.assignedTo}
                </span>
              )}
            </header>

            <div className={styles.messages}>
              {selected.messages.map((message) => (
                <article
                  className={styles[`message_${message.sender}`]}
                  key={message.id}
                >
                  {message.sender === "ai" ? (
                    <Bot aria-hidden="true" size={14} />
                  ) : null}
                  <span>{message.content}</span>
                  <small>{message.time}</small>
                </article>
              ))}
            </div>

            <div className={styles.composer}>
              <label>
                <span className="sr-only">Responder mensaje</span>
                <textarea
                  disabled={selected.status !== "human"}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder={
                    selected.status === "human"
                      ? "Escribe una respuesta"
                      : "Toma la conversación para responder"
                  }
                  rows={2}
                  value={reply}
                />
              </label>
              <button
                aria-label="Enviar respuesta"
                className="icon-button"
                disabled={!reply.trim() || selected.status !== "human"}
                onClick={sendReply}
                type="button"
              >
                <Send aria-hidden="true" size={18} />
              </button>
            </div>
          </main>
        ) : null}

        {selected ? (
          <aside className={styles.context}>
            <div>
              <span>Contexto</span>
              <h2>{selected.customer}</h2>
            </div>
            {selected.context?.length ? (
              <dl>
                {selected.context.map((item) => (
                  <div key={item.label}>
                    <dt>{item.label}</dt>
                    <dd>
                      {item.route ? (
                        <Link href={item.route}>{item.value}</Link>
                      ) : (
                        item.value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <div className={styles.noContext}>
                <MessageSquareText aria-hidden="true" size={18} /> Sin contexto
                vinculado
              </div>
            )}
            <label className="order-field">
              <span>Transferir a</span>
              <select
                onChange={(event) => setTransferTo(event.target.value)}
                value={transferTo}
              >
                <option value="">Seleccionar persona</option>
                <option value="Sofía M.">Sofía M.</option>
                <option value="Luis A.">Luis A.</option>
                <option value="Marco R.">Marco R.</option>
              </select>
            </label>
            <button
              className="button button--secondary button--full"
              disabled={!transferTo}
              onClick={() => {
                transferConversation(selected.id, transferTo);
                setFeedback(`Conversación transferida a ${transferTo}.`);
                setTransferTo("");
              }}
              type="button"
            >
              Transferir conversación
            </button>
          </aside>
        ) : null}
      </div>

      <p className="mock-disclaimer">
        Canales, entregas y permisos simulados hasta integrar mensajería y
        backend.
      </p>
    </div>
  );
}
