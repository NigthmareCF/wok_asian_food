export type OperationalOrder = {
  id: string;
  source: string;
  summary: string;
  elapsed: string;
  eta: string;
  status: "new" | "preparing" | "ready" | "delayed";
};

export type OperationalTableStatus =
  "free" | "occupied" | "reserved" | "preparing" | "out-of-service";

export type OperationalTable = {
  id: string;
  number: number;
  zone: "Salon" | "Terraza";
  capacity: number;
  status: OperationalTableStatus;
  guests: number;
  responsible?: string;
  openedAt?: string;
  elapsed?: string;
  balance: number;
  orderId?: string;
  adjacentTableIds?: string[];
  manualStatus?: {
    setBy: string;
    channel: "Operativo" | "Administrativo";
    time: string;
    reason: string;
  };
  nextReservation?: {
    time: string;
    guest: string;
    people: number;
  };
};

export type OperationalReservation = {
  id: string;
  time: string;
  guest: string;
  people: number;
  note?: string;
};

export const currentOperationalUser = "Antony";

export type TableOrderItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
};

export const operationalTables: OperationalTable[] = [
  {
    id: "table-1",
    number: 1,
    zone: "Salon",
    capacity: 2,
    status: "occupied",
    guests: 2,
    responsible: "Sofia M.",
    openedAt: "12:34",
    elapsed: "42 min",
    balance: 286,
    orderId: "A-101",
    adjacentTableIds: ["table-2"],
    nextReservation: { time: "14:30", guest: "Lucia Perez", people: 2 },
  },
  {
    id: "table-2",
    number: 2,
    zone: "Salon",
    capacity: 4,
    status: "free",
    guests: 0,
    balance: 0,
    adjacentTableIds: ["table-1", "table-3"],
    nextReservation: { time: "15:00", guest: "Diego Leon", people: 4 },
  },
  {
    id: "table-3",
    number: 3,
    zone: "Salon",
    capacity: 4,
    status: "free",
    guests: 0,
    balance: 0,
    adjacentTableIds: ["table-2", "table-4"],
  },
  {
    id: "table-4",
    number: 4,
    zone: "Salon",
    capacity: 4,
    status: "free",
    guests: 0,
    balance: 0,
    adjacentTableIds: ["table-3", "table-5"],
  },
  {
    id: "table-5",
    number: 5,
    zone: "Salon",
    capacity: 4,
    status: "occupied",
    guests: 7,
    responsible: "Luis A.",
    openedAt: "12:18",
    elapsed: "58 min",
    balance: 612,
    orderId: "A-104",
    adjacentTableIds: ["table-4", "table-6"],
  },
  {
    id: "table-6",
    number: 6,
    zone: "Salon",
    capacity: 6,
    status: "occupied",
    guests: 5,
    responsible: "Sofia M.",
    openedAt: "12:51",
    elapsed: "25 min",
    balance: 438,
    orderId: "A-105",
    adjacentTableIds: ["table-5", "table-7"],
  },
  {
    id: "table-7",
    number: 7,
    zone: "Salon",
    capacity: 2,
    status: "occupied",
    guests: 2,
    responsible: "Marco R.",
    openedAt: "13:04",
    elapsed: "12 min",
    balance: 244,
    orderId: "A-106",
    adjacentTableIds: ["table-6"],
  },
  {
    id: "table-8",
    number: 8,
    zone: "Terraza",
    capacity: 4,
    status: "reserved",
    guests: 0,
    responsible: "Marco R.",
    balance: 0,
    adjacentTableIds: ["table-9"],
    nextReservation: { time: "13:45", guest: "Ana Ruiz", people: 3 },
  },
  {
    id: "table-9",
    number: 9,
    zone: "Terraza",
    capacity: 2,
    status: "occupied",
    guests: 2,
    responsible: "Luis A.",
    openedAt: "11:57",
    elapsed: "1 h 19 min",
    balance: 196,
    orderId: "A-099",
    adjacentTableIds: ["table-8", "table-10"],
  },
  {
    id: "table-10",
    number: 10,
    zone: "Terraza",
    capacity: 6,
    status: "reserved",
    guests: 0,
    responsible: "Sofia M.",
    balance: 0,
    adjacentTableIds: ["table-9", "table-11"],
    nextReservation: { time: "14:00", guest: "Carlos Mena", people: 6 },
  },
  {
    id: "table-11",
    number: 11,
    zone: "Terraza",
    capacity: 4,
    status: "out-of-service",
    guests: 0,
    balance: 0,
    adjacentTableIds: ["table-10", "table-12"],
    manualStatus: {
      setBy: "Marco R.",
      channel: "Operativo",
      time: "12:42",
      reason: "Base inestable; requiere revisión de mantenimiento.",
    },
  },
  {
    id: "table-12",
    number: 12,
    zone: "Terraza",
    capacity: 4,
    status: "preparing",
    guests: 0,
    responsible: "Marco R.",
    balance: 0,
    adjacentTableIds: ["table-11"],
    nextReservation: { time: "13:30", guest: "Marta Solis", people: 4 },
  },
];

export const operationalReservationsToday: OperationalReservation[] = [
  {
    id: "reservation-201",
    time: "14:15",
    guest: "Valeria Gómez",
    people: 2,
    note: "Cumpleaños",
  },
  {
    id: "reservation-202",
    time: "14:45",
    guest: "Hugo Castillo",
    people: 4,
  },
  {
    id: "reservation-203",
    time: "15:30",
    guest: "Paola Méndez",
    people: 6,
    note: "Solicita espacio para silla de bebé",
  },
];

export const tableOrderItems: Record<string, TableOrderItem[]> = {
  "table-1": [
    { id: "item-1", name: "Ramen miso", quantity: 1, unitPrice: 118 },
    { id: "item-2", name: "Gyozas de cerdo", quantity: 1, unitPrice: 72 },
    { id: "item-3", name: "Te frio", quantity: 2, unitPrice: 48 },
  ],
  "table-5": [
    { id: "item-4", name: "Wok teriyaki", quantity: 3, unitPrice: 112 },
    { id: "item-5", name: "Roll tempura", quantity: 2, unitPrice: 96 },
    { id: "item-6", name: "Limonada", quantity: 2, unitPrice: 42 },
  ],
  "table-6": [
    { id: "item-7", name: "Pad thai", quantity: 3, unitPrice: 126 },
    { id: "item-8", name: "Agua mineral", quantity: 2, unitPrice: 30 },
  ],
  "table-7": [
    { id: "item-9", name: "Ramen shoyu", quantity: 2, unitPrice: 122 },
  ],
  "table-9": [
    { id: "item-10", name: "Bowl de salmon", quantity: 1, unitPrice: 148 },
    { id: "item-11", name: "Te verde", quantity: 1, unitPrice: 48 },
  ],
};

export const operationalTableSummary = {
  total: 12,
  occupied: 7,
  reserved: 2,
  free: 3,
};

export const operationalOrderSummary = {
  active: 11,
  attention: 3,
};

export const operationalKitchenSummary = {
  load: 74,
  eta: "21 min",
};

export const operationalOrders: OperationalOrder[] = [
  {
    id: "#A-104",
    source: "Mesa 7",
    summary: "2 ramen · 1 gyoza · 2 bebidas",
    elapsed: "Hace 12 min",
    eta: "9 min",
    status: "preparing",
  },
  {
    id: "#D-088",
    source: "Delivery",
    summary: "1 pad thai · 1 roll tempura",
    elapsed: "Hace 18 min",
    eta: "4 min",
    status: "delayed",
  },
  {
    id: "#A-106",
    source: "Mesa 3",
    summary: "1 wok teriyaki · 1 té frío",
    elapsed: "Hace 6 min",
    eta: "Listo",
    status: "ready",
  },
  {
    id: "#R-041",
    source: "Para recoger",
    summary: "2 bowls de salmón · 1 limonada",
    elapsed: "Hace 3 min",
    eta: "16 min",
    status: "new",
  },
];

export const operationalAlerts = [
  {
    id: "stock",
    title: "Salmón en nivel crítico",
    detail: "Quedan 6 porciones disponibles",
    time: "Ahora",
    tone: "danger" as const,
  },
  {
    id: "order",
    title: "Pedido #D-088 retrasado",
    detail: "Superó el ETA estimado por 7 minutos",
    time: "Hace 2 min",
    tone: "warning" as const,
  },
  {
    id: "table",
    title: "Mesa 9 espera cobro",
    detail: "La cuenta está abierta desde hace 18 minutos",
    time: "Hace 8 min",
    tone: "info" as const,
  },
];
