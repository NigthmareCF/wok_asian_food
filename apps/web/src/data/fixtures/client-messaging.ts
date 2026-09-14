export type ClientMessageState =
  "connecting" | "error" | "human-attention-required" | "ready";

export type ClientMessage = {
  id: string;
  sentBy: "client" | "system";
  text: string;
};

export type ClientConversation = {
  id: string;
  messages: ClientMessage[];
  state: ClientMessageState;
  title: string;
};

export const clientMessagingFixture: ClientConversation[] = [
  {
    id: "general-question",
    title: "Consulta general",
    state: "ready",
    messages: [
      {
        id: "welcome",
        sentBy: "system",
        text: "Esta conversación es demostrativa. Escribe un mensaje para verlo enviado localmente.",
      },
    ],
  },
  {
    id: "connection-status",
    title: "Estado de conexión",
    state: "connecting",
    messages: [],
  },
  {
    id: "delivery-error",
    title: "Estado del mensaje",
    state: "error",
    messages: [],
  },
  {
    id: "human-attention",
    title: "Consulta pendiente",
    state: "human-attention-required",
    messages: [],
  },
];
