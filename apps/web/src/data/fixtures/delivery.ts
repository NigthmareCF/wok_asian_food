export type DeliveryOrderStatus =
  | "waiting"
  | "driver-assigned"
  | "picked-up"
  | "delivered"
  | "rescheduled"
  | "cancelled";

export type DeliveryOrder = {
  id: string;
  source: string;
  customer: string;
  address: string;
  phone: string;
  items: DeliveryOrderItem[];
  status: DeliveryOrderStatus;
  createdAt: string;
  elapsed: string;
  eta: string;
  driver?: string;
  driverPhone?: string;
  vehicle?: string;
  paymentMethod: "cash" | "card" | "online";
  paymentStatus: "pending" | "collected" | "partial";
  total: number;
  notes?: string;
};

export type DeliveryOrderItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  modifiers?: string[];
};

export type Driver = {
  id: string;
  name: string;
  phone: string;
  vehicle: string;
  status: "available" | "on-delivery" | "offline";
  currentOrderId?: string;
};

export const deliveryDrivers: Driver[] = [
  {
    id: "driver-1",
    name: "Carlos Mendoza",
    phone: "555-0101",
    vehicle: "Moto · P-123ABC",
    status: "available",
  },
  {
    id: "driver-2",
    name: "Luis Ortega",
    phone: "555-0102",
    vehicle: "Bici · P-456DEF",
    status: "on-delivery",
    currentOrderId: "D-089",
  },
  {
    id: "driver-3",
    name: "María Gutiérrez",
    phone: "555-0103",
    vehicle: "Moto · P-789GHI",
    status: "available",
  },
  {
    id: "driver-4",
    name: "Roberto Silva",
    phone: "555-0104",
    vehicle: "Auto · P-321JKL",
    status: "offline",
  },
];

export const deliveryOrders: DeliveryOrder[] = [
  {
    id: "D-089",
    source: "Delivery · Andrea López",
    customer: "Andrea López",
    address: "Zona 10, Av. Reforma 12-34",
    phone: "555-2001",
    status: "driver-assigned",
    createdAt: "13:02",
    elapsed: "Hace 18 min",
    eta: "7 min tarde",
    driver: "Luis Ortega",
    driverPhone: "555-0102",
    vehicle: "Bici · P-456DEF",
    paymentMethod: "card",
    paymentStatus: "collected",
    total: 244,
    notes: "Entregar en recepción",
    items: [
      { id: "D-089-1", name: "Pad thai", quantity: 1, unitPrice: 148, modifiers: ["Camarón"] },
      { id: "D-089-2", name: "Roll tempura", quantity: 1, unitPrice: 96, modifiers: [] },
    ],
  },
  {
    id: "D-090",
    source: "Delivery · Roberto Díaz",
    customer: "Roberto Díaz",
    address: "Zona 4, Calzada Roosevelt 5-67",
    phone: "555-2002",
    status: "waiting",
    createdAt: "13:15",
    elapsed: "Hace 5 min",
    eta: "22 min",
    paymentMethod: "cash",
    paymentStatus: "pending",
    total: 190,
    items: [
      { id: "D-090-1", name: "Wok teriyaki", quantity: 1, unitPrice: 112, modifiers: ["Pollo", "Medio"] },
      { id: "D-090-2", name: "Limonada de jengibre", quantity: 2, unitPrice: 39 },
    ],
  },
  {
    id: "D-091",
    source: "Delivery · Sofía Herrera",
    customer: "Sofía Herrera",
    address: "Zona 15, Vista Hermosa III, Casa 12",
    phone: "555-2003",
    status: "picked-up",
    createdAt: "12:55",
    elapsed: "Hace 25 min",
    eta: "En camino · 8 min",
    driver: "María Gutiérrez",
    driverPhone: "555-0103",
    vehicle: "Moto · P-789GHI",
    paymentMethod: "online",
    paymentStatus: "collected",
    total: 312,
    notes: "Llamar al llegar",
    items: [
      { id: "D-091-1", name: "Bowl de salmón", quantity: 2, unitPrice: 148 },
      { id: "D-091-2", name: "Té verde frío", quantity: 1, unitPrice: 16 },
    ],
  },
  {
    id: "D-092",
    source: "Delivery · Carlos Méndez",
    customer: "Carlos Méndez",
    address: "Zona 1, Centro Histórico, 6a Av. 3-45",
    phone: "555-2004",
    status: "rescheduled",
    createdAt: "12:30",
    elapsed: "Hace 50 min",
    eta: "Reprogramado para 14:30",
    paymentMethod: "cash",
    paymentStatus: "pending",
    total: 286,
    notes: "Cliente solicitó cambio de horario",
    items: [
      { id: "D-092-1", name: "Ramen shoyu", quantity: 2, unitPrice: 122 },
      { id: "D-092-2", name: "Gyozas de cerdo", quantity: 1, unitPrice: 68 },
      { id: "D-092-3", name: "Agua mineral", quantity: 2, unitPrice: 16 },
    ],
  },
];

export const deliveryStatusMeta: Record<
  DeliveryOrderStatus,
  { label: string; tone: "success" | "info" | "warning" | "danger" | "neutral"; description: string }
> = {
  waiting: { label: "Esperando repartidor", tone: "info", description: "Pedido listo, sin repartidor asignado" },
  "driver-assigned": { label: "Repartidor asignado", tone: "warning", description: "Repartidor notificado, en ruta al restaurante" },
  "picked-up": { label: "Recogido", tone: "info", description: "Repartidor salió con el pedido" },
  delivered: { label: "Entregado", tone: "success", description: "Pedido entregado al cliente" },
  rescheduled: { label: "Reprogramado", tone: "neutral", description: "Entrega reagendada por solicitud" },
  cancelled: { label: "Cancelado", tone: "danger", description: "Pedido cancelado antes de entrega" },
};

export const deliverySummary = {
  total: 4,
  waiting: 1,
  assigned: 1,
  inTransit: 1,
  rescheduled: 1,
  completed: 0,
  pendingPayment: 2,
};

export const getDeliveryTotal = (items: DeliveryOrderItem[]) =>
  items.reduce((total, item) => total + item.unitPrice * item.quantity, 0);

export const formatGTQ = (amount: number) =>
  new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(amount);