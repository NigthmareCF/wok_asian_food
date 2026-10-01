export type PaymentMethod = "cash" | "card" | "transfer" | "online";
export type PaymentStatus = "pending" | "partial" | "paid" | "difference";

export type PaymentItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  assignedTo?: string;
};

export type PaymentRecord = {
  id: string;
  source: string;
  channel: "table" | "delivery" | "pickup";
  items: PaymentItem[];
  subtotal: number;
  tip: number;
  discount: number;
  total: number;
  payments: PaymentEntry[];
  status: PaymentStatus;
  createdAt: string;
  elapsed: string;
  responsible: string;
  tableId?: string;
};

export type PaymentEntry = {
  id: string;
  method: PaymentMethod;
  amount: number;
  reference?: string;
  collectedAt: string;
  collectedBy: string;
};

export type SplitPaymentProposal = {
  id: string;
  name: string;
  items: PaymentItem[];
  total: number;
};

export const paymentMethods: { value: PaymentMethod; label: string; icon: string }[] = [
  { value: "cash", label: "Efectivo", icon: "💵" },
  { value: "card", label: "Tarjeta", icon: "💳" },
  { value: "transfer", label: "Transferencia", icon: "📱" },
  { value: "online", label: "Pago en línea", icon: "🌐" },
];

export const paymentStatusMeta: Record<
  PaymentStatus,
  { label: string; tone: "success" | "info" | "warning" | "danger" }
> = {
  pending: { label: "Pendiente", tone: "info" },
  partial: { label: "Parcial", tone: "warning" },
  paid: { label: "Pagada", tone: "success" },
  difference: { label: "Diferencia", tone: "danger" },
};

export const paymentsRecords: PaymentRecord[] = [
  {
    id: "A-104",
    source: "Mesa 7",
    channel: "table",
    items: [
      { id: "A-104-1", name: "Ramen miso", quantity: 1, unitPrice: 118, total: 118 },
      { id: "A-104-2", name: "Gyozas de cerdo", quantity: 1, unitPrice: 72, total: 72 },
      { id: "A-104-3", name: "Té frío", quantity: 2, unitPrice: 48, total: 96 },
    ],
    subtotal: 286,
    tip: 28,
    discount: 0,
    total: 314,
    payments: [
      { id: "pay-1", method: "card", amount: 150, reference: "TXN-48291", collectedAt: "13:20", collectedBy: "Sofia M." },
      { id: "pay-2", method: "cash", amount: 164, collectedAt: "13:22", collectedBy: "Sofia M." },
    ],
    status: "paid",
    createdAt: "12:34",
    elapsed: "Hace 46 min",
    responsible: "Sofia M.",
    tableId: "table-1",
  },
  {
    id: "D-088",
    source: "Delivery · Andrea López",
    channel: "delivery",
    items: [
      { id: "D-088-1", name: "Pad thai", quantity: 1, unitPrice: 148, total: 148 },
      { id: "D-088-2", name: "Roll tempura", quantity: 1, unitPrice: 96, total: 96 },
    ],
    subtotal: 244,
    tip: 0,
    discount: 0,
    total: 244,
    payments: [
      { id: "pay-3", method: "online", amount: 244, reference: "MP-77102", collectedAt: "13:05", collectedBy: "Sistema" },
    ],
    status: "paid",
    createdAt: "13:02",
    elapsed: "Hace 18 min",
    responsible: "Carlos R.",
  },
  {
    id: "A-105",
    source: "Mesa 6",
    channel: "table",
    items: [
      { id: "A-105-1", name: "Wok teriyaki", quantity: 3, unitPrice: 112, total: 336 },
      { id: "A-105-2", name: "Roll tempura", quantity: 2, unitPrice: 96, total: 192 },
      { id: "A-105-3", name: "Limonada", quantity: 2, unitPrice: 42, total: 84 },
    ],
    subtotal: 612,
    tip: 0,
    discount: 50,
    total: 562,
    payments: [
      { id: "pay-4", method: "cash", amount: 300, collectedAt: "13:10", collectedBy: "Luis A." },
      { id: "pay-5", method: "transfer", amount: 200, reference: "TRF-99821", collectedAt: "13:12", collectedBy: "Luis A." },
    ],
    status: "partial",
    createdAt: "12:18",
    elapsed: "Hace 62 min",
    responsible: "Luis A.",
    tableId: "table-5",
  },
  {
    id: "A-106",
    source: "Mesa 3",
    channel: "table",
    items: [
      { id: "A-106-1", name: "Wok teriyaki", quantity: 1, unitPrice: 112, total: 112 },
      { id: "A-106-2", name: "Té verde frío", quantity: 1, unitPrice: 38, total: 38 },
    ],
    subtotal: 150,
    tip: 15,
    discount: 0,
    total: 165,
    payments: [],
    status: "pending",
    createdAt: "13:04",
    elapsed: "Hace 16 min",
    responsible: "Sofia M.",
    tableId: "table-6",
  },
  {
    id: "A-099",
    source: "Mesa 9",
    channel: "table",
    items: [
      { id: "A-099-1", name: "Bowl de salmón", quantity: 1, unitPrice: 148, total: 148 },
      { id: "A-099-2", name: "Té verde", quantity: 1, unitPrice: 48, total: 48 },
    ],
    subtotal: 196,
    tip: 0,
    discount: 0,
    total: 196,
    payments: [
      { id: "pay-6", method: "card", amount: 200, reference: "TXN-11456", collectedAt: "13:15", collectedBy: "Marco R." },
    ],
    status: "difference",
    createdAt: "11:57",
    elapsed: "Hace 1 h 23 min",
    responsible: "Marco R.",
    tableId: "table-9",
  },
];

export const getPaymentTotal = (record: PaymentRecord) =>
  record.payments.reduce((sum, p) => sum + p.amount, 0);

export const getPaymentRemaining = (record: PaymentRecord) =>
  record.total - getPaymentTotal(record);

export const paymentSummary = {
  total: paymentsRecords.length,
  pending: paymentsRecords.filter((p) => p.status === "pending").length,
  partial: paymentsRecords.filter((p) => p.status === "partial").length,
  paid: paymentsRecords.filter((p) => p.status === "paid").length,
  difference: paymentsRecords.filter((p) => p.status === "difference").length,
  pendingAmount: paymentsRecords
    .filter((p) => p.status !== "paid")
    .reduce((sum, p) => sum + getPaymentRemaining(p), 0),
};

export const formatGTQ = (amount: number) =>
  new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(amount);