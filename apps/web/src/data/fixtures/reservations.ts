export type ReservationStatus =
  "upcoming" | "confirmed" | "late" | "preorder" | "expired";

export type ReservationSource = "phone" | "online" | "walk-in";

export type ReservationRecord = {
  id: string;
  date: string;
  time: string;
  guest: string;
  phone: string;
  people: number;
  status: ReservationStatus;
  source: ReservationSource;
  tableNumber?: number;
  preorder: boolean;
  note?: string;
  createdAt: string;
};

export type CreateReservationInput = Omit<
  ReservationRecord,
  "id" | "createdAt"
>;

export const initialReservations: ReservationRecord[] = [
  {
    id: "RSV-201",
    date: "2026-09-11",
    time: "13:45",
    guest: "Ana Ruiz",
    phone: "+502 5555 0182",
    people: 3,
    status: "confirmed",
    source: "phone",
    tableNumber: 8,
    preorder: false,
    note: "Prefiere terraza.",
    createdAt: "10:22",
  },
  {
    id: "RSV-202",
    date: "2026-09-11",
    time: "14:15",
    guest: "Valeria Gómez",
    phone: "+502 5555 0124",
    people: 2,
    status: "upcoming",
    source: "online",
    tableNumber: 2,
    preorder: false,
    note: "Cumpleaños.",
    createdAt: "11:06",
  },
  {
    id: "RSV-203",
    date: "2026-09-11",
    time: "14:45",
    guest: "Hugo Castillo",
    phone: "+502 5555 0158",
    people: 4,
    status: "upcoming",
    source: "phone",
    tableNumber: 4,
    preorder: false,
    createdAt: "11:43",
  },
  {
    id: "RSV-204",
    date: "2026-09-11",
    time: "21:30",
    guest: "Paola Méndez",
    phone: "+502 5555 0191",
    people: 6,
    status: "preorder",
    source: "online",
    tableNumber: 10,
    preorder: true,
    note: "Incluye espacio para silla de bebé.",
    createdAt: "12:02",
  },
  {
    id: "RSV-198",
    date: "2026-09-11",
    time: "12:30",
    guest: "Mario Estrada",
    phone: "+502 5555 0170",
    people: 2,
    status: "expired",
    source: "online",
    preorder: false,
    createdAt: "09:14",
  },
  {
    id: "RSV-205",
    date: "2026-09-12",
    time: "18:00",
    guest: "Lucía Pérez",
    phone: "+502 5555 0132",
    people: 4,
    status: "confirmed",
    source: "phone",
    tableNumber: 6,
    preorder: false,
    createdAt: "12:18",
  },
];

export const reservationStatusMeta: Record<
  ReservationStatus,
  { label: string; tone: string }
> = {
  upcoming: { label: "Próxima", tone: "info" },
  confirmed: { label: "Confirmada", tone: "success" },
  late: { label: "Tardía", tone: "warning" },
  preorder: { label: "Con preorden", tone: "warning" },
  expired: { label: "Vencida", tone: "danger" },
};
