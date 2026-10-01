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

export type OnlineRequestKind = "delivery" | "pickup" | "dine-in" | "reservation";

export type OnlineRequestItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  modifiers?: string[];
};

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
  kind: OnlineRequestKind;
  items?: OnlineRequestItem[];
  total?: number;
  address?: string;
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
    kind: "reservation",
  },
  {
    id: "SOL-082",
    customer: "Camila Reyes",
    phone: "+502 5555 0156",
    requestedAt: "Hace 6 min",
    date: "2026-09-11",
    time: "21:15",
    people: 0,
    note: "Envío a la oficina.",
    preorder: false,
    status: "pending",
    lastValidatedAt: "13:19",
    kind: "delivery",
    address: "Zona 10, Edificio Comercio 8, oficina 412",
    items: [
      { id: "sol-82-1", name: "Wok teriyaki", quantity: 2, unitPrice: 112, modifiers: ["Pollo", "Picante medio"] },
      { id: "sol-82-2", name: "Edamame picante", quantity: 1, unitPrice: 48 },
      { id: "sol-82-3", name: "Agua de Jamaica", quantity: 2, unitPrice: 28 },
    ],
    total: 328,
  },
  {
    id: "SOL-083",
    customer: "Luis Mendoza",
    phone: "+502 5555 0194",
    requestedAt: "Hace 9 min",
    date: "2026-09-11",
    time: "20:45",
    people: 0,
    preorder: false,
    status: "pending",
    lastValidatedAt: "13:16",
    kind: "pickup",
    items: [
      { id: "sol-83-1", name: "Gyozas de cerdo", quantity: 1, unitPrice: 68 },
      { id: "sol-83-2", name: "Salmón asado", quantity: 1, unitPrice: 148 },
    ],
    total: 216,
  },
  {
    id: "SOL-084",
    customer: "Mario Estrada",
    phone: "+502 5555 0140",
    requestedAt: "Hace 12 min",
    date: "2026-09-11",
    time: "19:30",
    people: 2,
    preorder: false,
    status: "pending",
    lastValidatedAt: "13:13",
    kind: "dine-in",
    items: [
      { id: "sol-84-1", name: "Sushi mix", quantity: 1, unitPrice: 188 },
    ],
    total: 188,
  },
  {
    id: "SOL-079",
    customer: "Ricardo Fuentes",
    phone: "+502 5555 0177",
    requestedAt: "Hace 26 min",
    date: "2026-09-11",
    time: "20:00",
    people: 4,
    note: "Celebración familiar.",
    preorder: false,
    status: "outdated",
    lastValidatedAt: "12:59",
    kind: "reservation",
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
    kind: "reservation",
  },
];
