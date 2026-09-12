export type ConversationStatus = "unassigned" | "ai" | "human" | "attention";
export type ConversationChannel = "whatsapp" | "web" | "instagram";

export type ConversationMessage = {
  id: string;
  sender: "customer" | "ai" | "staff";
  content: string;
  time: string;
};

export type ConversationRecord = {
  id: string;
  customer: string;
  channel: ConversationChannel;
  status: ConversationStatus;
  preview: string;
  lastAt: string;
  unread: number;
  assignedTo?: string;
  context?: { label: string; value: string; route?: string }[];
  messages: ConversationMessage[];
};

export type OnlineRequestStatus =
  "pending" | "outdated" | "accepted" | "rejected";

export type OnlineRequestRecord = {
  id: string;
  customer: string;
  phone: string;
  requestedAt: string;
  date: string;
  time: string;
  people: number;
  note?: string;
  preorder: boolean;
  status: OnlineRequestStatus;
  lastValidatedAt: string;
  rejectionReason?: string;
};

export const initialConversations: ConversationRecord[] = [
  {
    id: "CONV-31",
    customer: "Andrea López",
    channel: "whatsapp",
    status: "attention",
    preview: "¿Pueden cambiar la hora de mi reservación?",
    lastAt: "13:22",
    unread: 2,
    context: [
      {
        label: "Reservación",
        value: "RSV-202",
        route: "/operation/reservations/RSV-202",
      },
      { label: "Visitas", value: "3 anteriores" },
    ],
    messages: [
      {
        id: "msg-1",
        sender: "customer",
        content: "Hola, tengo una reservación para hoy.",
        time: "13:19",
      },
      {
        id: "msg-2",
        sender: "ai",
        content: "Claro. ¿Qué cambio necesitas realizar?",
        time: "13:20",
      },
      {
        id: "msg-3",
        sender: "customer",
        content: "¿Pueden cambiarla de las 14:15 a las 15:00?",
        time: "13:22",
      },
    ],
  },
  {
    id: "CONV-32",
    customer: "Mateo Díaz",
    channel: "web",
    status: "ai",
    preview: "Quisiera saber si mi pedido ya está listo.",
    lastAt: "13:18",
    unread: 1,
    context: [
      { label: "Pedido", value: "R-041", route: "/operation/orders/R-041" },
    ],
    messages: [
      {
        id: "msg-4",
        sender: "customer",
        content: "Quisiera saber si mi pedido ya está listo.",
        time: "13:18",
      },
      {
        id: "msg-5",
        sender: "ai",
        content: "Estoy consultando el estado del pedido.",
        time: "13:18",
      },
    ],
  },
  {
    id: "CONV-33",
    customer: "Paola Méndez",
    channel: "instagram",
    status: "unassigned",
    preview: "¿Tienen espacio para seis personas mañana?",
    lastAt: "13:12",
    unread: 1,
    messages: [
      {
        id: "msg-6",
        sender: "customer",
        content: "¿Tienen espacio para seis personas mañana?",
        time: "13:12",
      },
    ],
  },
  {
    id: "CONV-28",
    customer: "Carlos Mena",
    channel: "whatsapp",
    status: "human",
    preview: "Gracias, nos vemos a las 14:00.",
    lastAt: "12:58",
    unread: 0,
    assignedTo: "Sofía M.",
    context: [
      { label: "Mesa", value: "10", route: "/operation/tables/table-10" },
    ],
    messages: [
      {
        id: "msg-7",
        sender: "staff",
        content: "La mesa quedó confirmada para las 14:00.",
        time: "12:57",
      },
      {
        id: "msg-8",
        sender: "customer",
        content: "Gracias, nos vemos a las 14:00.",
        time: "12:58",
      },
    ],
  },
];

export const initialOnlineRequests: OnlineRequestRecord[] = [
  {
    id: "SOL-081",
    customer: "Gabriela Soto",
    phone: "+502 5555 0121",
    requestedAt: "Hace 4 min",
    date: "2026-09-11",
    time: "18:30",
    people: 4,
    note: "Prefiere terraza.",
    preorder: false,
    status: "pending",
    lastValidatedAt: "13:21",
  },
  {
    id: "SOL-079",
    customer: "Ricardo Fuentes",
    phone: "+502 5555 0177",
    requestedAt: "Hace 26 min",
    date: "2026-09-11",
    time: "20:00",
    people: 6,
    note: "Celebración familiar.",
    preorder: false,
    status: "outdated",
    lastValidatedAt: "12:59",
  },
  {
    id: "SOL-076",
    customer: "Elena Morales",
    phone: "+502 5555 0164",
    requestedAt: "Hace 1 h",
    date: "2026-09-12",
    time: "21:30",
    people: 2,
    preorder: true,
    status: "accepted",
    lastValidatedAt: "12:31",
  },
];
