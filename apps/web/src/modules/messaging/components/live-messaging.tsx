"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/shared/components/ui/button";
import { useClientPickupResource } from "@/modules/client-order-tracking/use-client-pickup-resource";
import { useClientIdentity } from "@/modules/clients/use-client-identity";
import { createClientOperation } from "@/modules/clients/client-identity-store";
import { useSubmission } from "@/modules/client-workflows/use-submission";
import {
  isConversation,
  isConversations,
  isMessages,
  isMessageReceipt,
  parseMessage,
  type Conversation,
} from "../live-contract";
import styles from "./live-messaging.module.css";
const labels: Record<string, string> = {
  OPEN: "Abierta",
  WAITING: "Esperando respuesta del restaurante",
  CLOSED: "Cerrada",
  UNKNOWN:
    "Esta conversación salió de la bandeja. Consulta sus mensajes actuales antes de responder.",
};
export function LiveMessaging({
  userId,
  staff = false,
}: {
  userId: string;
  staff?: boolean;
}) {
  const base = `/bff/conversations/${staff ? "operational" : "client"}`;
  const { identity, verified, refresh } = useClientIdentity(userId);
  const list = useClientPickupResource(base, isConversations, userId);
  const [selected, setSelected] = useState<Conversation | null>(null),
    [error, setError] = useState(""),
    [opening, setOpening] = useState(false);
  const lock = useRef(false);
  async function open() {
    if (lock.current || !verified) return;
    const operation = createClientOperation(identity);
    lock.current = true;
    setOpening(true);
    setError("");
    try {
      if (!(await operation.confirm())) return;
      const response = await fetch(base, {
        method: "POST",
        headers: { "X-Wok-Expected-Principal": userId },
        signal: operation.signal,
      });
      const body = await response.json();
      if (!(await operation.confirm())) return;
      if (!response.ok || !isConversation(body))
        throw new Error(
          "No se pudo abrir la conversación. Reintenta o inicia sesión nuevamente.",
        );
      setSelected(body);
      list.reload();
    } catch (e) {
      if (operation.valid())
        setError(
          e instanceof Error ? e.message : "No se pudo abrir la conversación.",
        );
    } finally {
      operation.dispose();
      lock.current = false;
      setOpening(false);
    }
  }
  const current = verified
    ? (list.data?.find((c) => c.conversationId === selected?.conversationId) ??
      (selected && staff && list.data
        ? { ...selected, status: "UNKNOWN" }
        : selected))
    : null;
  return (
    <div className={styles.page}>
      <h1>{staff ? "Mensajes de clientes" : "Mensajes al restaurante"}</h1>
      {!verified && (
        <div>
          <p role="status">Verifica tu sesión para consultar mensajes.</p>
          <Button onClick={() => void refresh()}>Verificar sesión</Button>
        </div>
      )}
      <p>
        {staff
          ? "Bandeja compartida del personal. Al responder, la conversación sale de la cola de espera."
          : "Envía tu consulta al restaurante. Las respuestas se actualizan automáticamente."}
      </p>
      <div>
        <Button onClick={list.reload}>Actualizar conversaciones</Button>
        {!staff && (
          <Button disabled={opening || !verified} onClick={() => void open()}>
            {opening ? "Abriendo…" : "Abrir conversación"}
          </Button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {list.error && (
        <p role="alert">
          {list.error.message}{" "}
          <Link
            href={
              staff
                ? "/login?next=%2Foperation%2Fmessages"
                : "/login?next=%2Fclient%2Fmessages"
            }
          >
            Iniciar sesión
          </Link>
        </p>
      )}
      <div className={styles.columns}>
        <section className={styles.panel} aria-label="Conversaciones">
          {!list.data && !list.error ? (
            <p role="status">Consultando conversaciones…</p>
          ) : list.data?.length === 0 ? (
            <p>
              {staff
                ? "No hay conversaciones esperando respuesta."
                : "Todavía no tienes conversaciones."}
            </p>
          ) : (
            list.data?.map((c) => (
              <button
                className={styles.conversation}
                key={c.conversationId}
                aria-pressed={c.conversationId === current?.conversationId}
                onClick={() => setSelected(c)}
              >
                <strong>
                  {staff ? (c.customerName ?? "Cliente") : "Restaurante"}
                </strong>
                <span>{labels[c.status]}</span>
                <span>{c.lastMessage?.slice(0, 140) ?? "Ver mensajes"}</span>
              </button>
            ))
          )}
        </section>
        {current ? (
          <ConversationThread
            key={`${userId}:${current.conversationId}`}
            userId={userId}
            base={base}
            conversation={current}
            onChange={list.reload}
            onSent={() => {
              setSelected({ ...current, status: staff ? "OPEN" : "WAITING" });
              list.reload();
            }}
          />
        ) : (
          <p>Selecciona una conversación para ver sus mensajes.</p>
        )}
      </div>
    </div>
  );
}
function ConversationThread({
  userId,
  base,
  conversation,
  onChange,
  onSent,
}: {
  userId: string;
  base: string;
  conversation: Conversation;
  onChange: () => void;
  onSent: () => void;
}) {
  const url = `${base}/${conversation.conversationId}/messages`;
  const messages = useClientPickupResource(url, isMessages, userId);
  const submission = useSubmission(
    `wok.message.attempt.v1:${userId}:${conversation.conversationId}`,
    url,
    parseMessage,
    isMessageReceipt,
    userId,
  );
  const [body, setBody] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  async function send(e: FormEvent) {
    e.preventDefault();
    const result = await submission.send({ body });
    if (result) {
      setBody("");
      messages.reload();
      onSent();
    }
  }
  const receipt = submission.attempt?.receipt;
  return (
    <section className={styles.panel} aria-label="Mensajes de la conversación">
      <h2 ref={heading} tabIndex={-1}>
        Conversación
      </h2>
      <p>{labels[conversation.status]}</p>
      <Button
        onClick={() => {
          messages.reload();
          onChange();
        }}
      >
        Actualizar mensajes
      </Button>
      <div role="log" aria-label="Historial de mensajes" aria-live="polite">
        {messages.error ? (
          <p role="alert">{messages.error.message}</p>
        ) : !messages.data ? (
          <p role="status">Consultando mensajes…</p>
        ) : messages.data.length === 0 ? (
          <p>Aún no hay mensajes.</p>
        ) : (
          messages.data.map((m) => (
            <article className={styles.message} key={m.messageId}>
              <strong>
                {m.senderType === "CUSTOMER"
                  ? "Cliente"
                  : m.senderType === "HUMAN"
                    ? "Restaurante"
                    : m.senderType}
              </strong>
              <p>{m.body}</p>
              <small>{new Date(m.createdAt).toLocaleString("es-GT")}</small>
            </article>
          ))
        )}
      </div>
      {submission.error && <p role="alert">{submission.error}</p>}
      {receipt ? (
        <div role="status">
          <p>Mensaje enviado.</p>
          <Button onClick={submission.clear}>Escribir otro mensaje</Button>
        </div>
      ) : conversation.status === "CLOSED" ? (
        <p>Esta conversación está cerrada.</p>
      ) : (
        <form className={styles.compose} onSubmit={send}>
          {submission.attempt ? (
            <p>
              Mensaje guardado para reintentar:{" "}
              {submission.attempt.payload.body}
            </p>
          ) : (
            <>
              <label htmlFor="message-body">Tu mensaje</label>
              <textarea
                id="message-body"
                required
                maxLength={4000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </>
          )}
          <Button
            type="submit"
            disabled={submission.busy || (!submission.attempt && !body.trim())}
          >
            {submission.busy
              ? "Enviando…"
              : submission.attempt
                ? "Reintentar el mismo mensaje"
                : "Enviar mensaje"}
          </Button>
        </form>
      )}
    </section>
  );
}
