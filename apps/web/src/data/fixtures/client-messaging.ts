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

export const deliveryQuickReplies = [
  "¿Dónde está mi pedido?",
  "¿Cuál es el tiempo estimado de entrega?",
  "Estoy en la entrada.",
  "No encuentro al repartidor.",
  "Necesito ayuda con mi entrega.",
] as const;

/** Conversaciones disponibles localmente; no representan canales conectados. */
export const clientMessagingFixture: ClientConversation[] = [
  {
    id: "delivery-order",
    title: "Delivery de mi pedido",
    state: "ready",
    messages: [],
  },
  {
    id: "general-question",
    title: "Ayuda general",
    state: "ready",
    messages: [],
  },
];

/** Estados alternativos exclusivamente para pruebas. */
export const clientMessagingStateFixtures: ClientConversation[] = [
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
