"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { FileText, MessageCircle, Send } from "lucide-react";
import {
  clientMessagingFixture,
  deliveryQuickReplies,
  type ClientConversation,
} from "@/data/fixtures/client-messaging";
import { useClientSession } from "@/modules/clients/client-session-provider";
import { findDeliveryOrder } from "@/modules/clients/client-session";
import { orderStatusLabels } from "@/modules/client-order-tracking/order-tracking";
import { Button } from "@/shared/components/ui/button";
import styles from "./client-messaging.module.css";

const stateContent = {
  connecting: "Conexión pendiente. Todavía no se ha establecido comunicación.",
  error: "No se pudo enviar el mensaje. Tu borrador se conserva.",
  "human-attention-required":
    "Atención humana requerida. Todavía no se ha contactado a una persona.",
  ready:
    "Guardado solamente durante esta sesión. Los mensajes todavía no se envían al restaurante ni al repartidor.",
} as const;

export function ClientMessagingView({
  conversations = clientMessagingFixture,
}: {
  conversations?: ClientConversation[];
}) {
  const session = useClientSession();
  const [selectedId, setSelectedId] = useState(conversations[0]?.id ?? "");
  const [attachmentName, setAttachmentName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLInputElement>(null);
  const selected =
    conversations.find((conversation) => conversation.id === selectedId) ??
    conversations[0];
  const deliveryOrder = findDeliveryOrder(session.orders);
  const isDelivery = selected?.id === "delivery-order";
  const conversationKey =
    isDelivery && deliveryOrder
      ? `delivery-order:${deliveryOrder.id}`
      : (selected?.id ?? "");
  const draft = session.drafts[conversationKey] ?? "";
  const messages = session.messages[conversationKey] ?? [];
  const deliveryFinished =
    deliveryOrder?.status === "delivered" ||
    deliveryOrder?.deliveryStage === "delivered";
  const deliveryBlocked =
    isDelivery &&
    (!deliveryOrder ||
      deliveryFinished ||
      deliveryOrder.deliveryStage !== "in-transit");
  const blocked =
    deliveryBlocked ||
    selected?.state === "connecting" ||
    selected?.state === "error";

  function selectConversation(id: string) {
    setSelectedId(id);
    setAttachmentName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }
  function saveMessage() {
    if (blocked || !draft.trim()) return;
    session.saveMessage(
      conversationKey,
      isDelivery ? deliveryOrder?.id : undefined,
    );
    composerRef.current?.focus();
  }

  return (
    <section className={styles.messaging} aria-labelledby="messages-title">
      <Link className="button button--secondary" href="/client">
        Volver al inicio de Cliente
      </Link>
      <header className={styles.header}>
        <span className={styles.kicker}>CENTRO DE MENSAJES</span>
        <h1 id="messages-title">Mensajes</h1>
      </header>
      {!selected ? (
        <p className={styles.empty}>No hay conversaciones disponibles.</p>
      ) : (
        <div className={styles.workspace}>
          <aside className={styles.list} aria-label="Conversaciones">
            <h2>Conversaciones</h2>
            {conversations.map((conversation) => (
              <button
                aria-pressed={conversation.id === selected.id}
                className={
                  conversation.id === selected.id ? styles.selected : ""
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
              <h2>{selected.title}</h2>
            </div>
            <p className={styles.stateDescription} role="status">
              {stateContent[selected.state]}
            </p>
            {isDelivery ? (
              <div className={styles.deliveryContext}>
                {!deliveryOrder ? (
                  <p>
                    No hay una entrega activa. Puedes escribir en Ayuda general.
                  </p>
                ) : null}
                {!deliveryOrder ? (
                  <Link href="/client/orders">Ver mis pedidos</Link>
                ) : (
                  <p>
                    {deliveryFinished
                      ? "Entrega finalizada. Esta conversación es de solo lectura."
                      : deliveryOrder.deliveryStage !== "in-transit"
                        ? "El chat estará disponible cuando tu pedido esté en camino."
                        : "Pedido en camino. Puedes guardar mensajes localmente."}
                  </p>
                )}
                {deliveryOrder ? (
                  <>
                    <p>
                      Pedido #{deliveryOrder.id} ·{" "}
                      {orderStatusLabels[deliveryOrder.status]}
                    </p>
                    <Link
                      className="button button--secondary"
                      href={`/client/orders/${deliveryOrder.id}`}
                    >
                      Ver seguimiento
                    </Link>
                  </>
                ) : null}
                <div
                  className={styles.quickReplies}
                  aria-label="Respuestas rápidas de delivery"
                >
                  {deliveryQuickReplies.map((reply) => (
                    <Button
                      disabled={blocked}
                      type="button"
                      variant="secondary"
                      key={reply}
                      onClick={() => {
                        session.setMessageDraft(conversationKey, reply);
                        composerRef.current?.focus();
                      }}
                    >
                      {reply}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
            <div
              className={styles.messageList}
              role="log"
              aria-label="Mensajes guardados"
              aria-live="polite"
            >
              {messages.length ? (
                messages.map((message) => (
                  <div className={styles["message-client"]} key={message.id}>
                    <p>{message.text}</p>
                    <small>
                      <time dateTime={message.createdAt}>
                        {new Date(message.createdAt).toLocaleTimeString(
                          "es-GT",
                          { hour: "2-digit", minute: "2-digit" },
                        )}
                      </time>{" "}
                      · Guardado localmente; todavía no enviado
                    </small>
                  </div>
                ))
              ) : (
                <p className={styles.empty}>
                  Todavía no hay mensajes en esta conversación.
                </p>
              )}
            </div>
            <div className={styles.composer}>
              <label className={styles.fileLabel} htmlFor="local-receipt">
                <FileText aria-hidden="true" size={18} />
                Seleccionar comprobante
              </label>
              <input
                disabled={blocked}
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
              <form
                className={styles.sendRow}
                onSubmit={(event) => {
                  event.preventDefault();
                  saveMessage();
                }}
              >
                <label className="sr-only" htmlFor="message-draft">
                  Escribe un mensaje
                </label>
                <input
                  disabled={blocked}
                  id="message-draft"
                  ref={composerRef}
                  onChange={(event) =>
                    session.setMessageDraft(conversationKey, event.target.value)
                  }
                  placeholder="Escribe un mensaje..."
                  value={draft}
                />
                <Button
                  aria-label="Guardar mensaje localmente"
                  disabled={blocked || !draft.trim()}
                  type="submit"
                >
                  <Send aria-hidden="true" size={19} />
                  <span className={styles.sendLabel}>Guardar localmente</span>
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
