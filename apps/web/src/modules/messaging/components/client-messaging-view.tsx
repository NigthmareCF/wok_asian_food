"use client";

import { useRef, useState } from "react";
import { FileText, MessageCircle, Send } from "lucide-react";
import type {
  ClientConversation,
  ClientMessage,
} from "@/data/fixtures/client-messaging";
import { clientMessagingFixture } from "@/data/fixtures/client-messaging";
import { Button } from "@/shared/components/ui/button";
import styles from "./client-messaging.module.css";

const stateContent = {
  connecting: {
    label: "Conectando",
    description: "Estado demostrativo: no se establece una conexión real.",
  },
  error: {
    label: "Error",
    description:
      "Estado demostrativo: el mensaje no se envió a ningún servicio.",
  },
  "human-attention-required": {
    label: "Atención humana requerida",
    description:
      "Esta conversación requiere atención humana. No se ha contactado a una persona.",
  },
  ready: {
    label: "Enviado localmente",
    description:
      "Los mensajes de esta vista solo existen durante esta sesión de pantalla.",
  },
} as const;

export function ClientMessagingView({
  conversations = clientMessagingFixture,
}: {
  conversations?: ClientConversation[];
}) {
  const [selectedId, setSelectedId] = useState(conversations[0]?.id ?? "");
  const [draft, setDraft] = useState("");
  const [attachmentName, setAttachmentName] = useState("");
  const [localMessages, setLocalMessages] = useState<
    Record<string, ClientMessage[]>
  >({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedConversation = conversations.find(
    (conversation) => conversation.id === selectedId,
  );

  if (!selectedConversation) {
    return <p className={styles.empty}>No hay conversaciones demostrativas.</p>;
  }

  const selectedConversationId = selectedConversation.id;
  const messages = [
    ...selectedConversation.messages,
    ...(localMessages[selectedConversationId] ?? []),
  ];
  const state = stateContent[selectedConversation.state];

  function selectConversation(conversationId: string) {
    setSelectedId(conversationId);
    setDraft("");
    setAttachmentName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function sendMessage() {
    const text = draft.trim();
    if (!text) return;

    setLocalMessages((current) => ({
      ...current,
      [selectedConversationId]: [
        ...(current[selectedConversationId] ?? []),
        { id: `local-${Date.now()}`, sentBy: "client", text },
      ],
    }));
    setDraft("");
  }

  return (
    <section className={styles.messaging} aria-labelledby="messages-title">
      <header className={styles.header}>
        <span className={styles.kicker}>CENTRO DE MENSAJES</span>
        <h1 id="messages-title">Mensajes</h1>
        <p>
          Conversaciones demostrativas de Cliente; no hay comunicación real.
        </p>
      </header>

      <div className={styles.workspace}>
        <aside className={styles.list} aria-label="Conversaciones">
          <h2>Conversaciones</h2>
          {conversations.map((conversation) => (
            <button
              aria-pressed={conversation.id === selectedConversation.id}
              className={
                conversation.id === selectedConversation.id
                  ? styles.selected
                  : ""
              }
              key={conversation.id}
              onClick={() => selectConversation(conversation.id)}
              type="button"
            >
              <MessageCircle aria-hidden="true" size={18} />
              {conversation.title}
            </button>
          ))}
        </aside>

        <div className={styles.thread}>
          <div className={styles.threadHeader}>
            <div>
              <h2>{selectedConversation.title}</h2>
              <p
                className={`${styles.state} ${styles[`state-${selectedConversation.state}`]}`}
              >
                {state.label}
              </p>
            </div>
            <span className={styles.demo}>Datos simulados</span>
          </div>

          <p className={styles.stateDescription} role="status">
            {state.description}
          </p>

          <div className={styles.messageList} aria-live="polite">
            {messages.length ? (
              messages.map((message) => (
                <p
                  className={styles[`message-${message.sentBy}`]}
                  key={message.id}
                >
                  {message.text}
                </p>
              ))
            ) : (
              <p className={styles.empty}>
                No hay mensajes en esta conversación demostrativa.
              </p>
            )}
          </div>

          <div className={styles.composer}>
            <label className={styles.fileLabel} htmlFor="local-receipt">
              <FileText aria-hidden="true" size={18} />
              Seleccionar comprobante
            </label>
            <input
              id="local-receipt"
              onChange={(event) =>
                setAttachmentName(event.target.files?.[0]?.name ?? "")
              }
              ref={fileInputRef}
              type="file"
            />
            {attachmentName ? (
              <p className={styles.fileNotice}>
                {attachmentName}. Archivo seleccionado localmente; no enviado.
              </p>
            ) : null}
            <div className={styles.sendRow}>
              <label className="sr-only" htmlFor="message-draft">
                Escribe un mensaje
              </label>
              <input
                id="message-draft"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") sendMessage();
                }}
                placeholder="Escribe un mensaje..."
                value={draft}
              />
              <Button
                aria-label="Enviar mensaje localmente"
                onClick={sendMessage}
                type="button"
              >
                <Send aria-hidden="true" size={19} />
                <span className={styles.sendLabel}>Enviar localmente</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
