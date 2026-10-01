export type InventoryItemStatus =
  | "available"
  | "low"
  | "critical"
  | "reserved"
  | "expired";

export type InventoryItem = {
  id: string;
  name: string;
  category: string;
  unit: string;
  stock: number;
  reserved: number;
  available: number;
  minStock: number;
  maxStock: number;
  status: InventoryItemStatus;
  lots: InventoryLot[];
  lastEntry?: string;
  lastAdjustment?: string;
};

export type InventoryLot = {
  id: string;
  itemId: string;
  quantity: number;
  entryDate: string;
  expiryDate: string;
  supplier: string;
  cost: number;
  batchCode?: string;
};

export type InventoryAdjustmentReason =
  | "damage"
  | "expired"
  | "theft"
  | "correction"
  | "recipe"
  | "other";

export const inventoryAdjustmentReasons: {
  value: InventoryAdjustmentReason;
  label: string;
}[] = [
  { value: "damage", label: "Daño" },
  { value: "expired", label: "Caducado" },
  { value: "theft", label: "Merma/Robo" },
  { value: "correction", label: "Corrección" },
  { value: "recipe", label: "Uso en receta" },
  { value: "other", label: "Otro" },
];

export type InventoryMovementType = "entry" | "adjustment" | "output";

export type InventoryMovement = {
  id: string;
  itemId: string;
  itemName: string;
  type: InventoryMovementType;
  quantity: number;
  lotId?: string;
  reason?: string;
  createdBy: string;
  createdAt: string;
};

export const inventoryItems: InventoryItem[] = [
  {
    id: "inv-001",
    name: "Fideos de arroz",
    category: "Base",
    unit: "kg",
    stock: 24,
    reserved: 4,
    available: 20,
    minStock: 10,
    maxStock: 50,
    status: "available",
    lastEntry: "09:30",
    lots: [
      {
        id: "lot-001",
        itemId: "inv-001",
        quantity: 15,
        entryDate: "2026-09-08",
        expiryDate: "2026-12-08",
        supplier: "Distribuidora Asia",
        cost: 18.5,
        batchCode: "FA-2026-091",
      },
      {
        id: "lot-002",
        itemId: "inv-001",
        quantity: 9,
        entryDate: "2026-09-10",
        expiryDate: "2026-12-10",
        supplier: "Distribuidora Asia",
        cost: 19.0,
        batchCode: "FA-2026-092",
      },
    ],
  },
  {
    id: "inv-002",
    name: "Pasta de curry rojo",
    category: "Salsas",
    unit: "kg",
    stock: 5,
    reserved: 2,
    available: 3,
    minStock: 8,
    maxStock: 30,
    status: "low",
    lastEntry: "08:15",
    lots: [
      {
        id: "lot-003",
        itemId: "inv-002",
        quantity: 5,
        entryDate: "2026-09-05",
        expiryDate: "2026-10-05",
        supplier: "Thai Imports",
        cost: 42.0,
        batchCode: "CR-2026-088",
      },
    ],
  },
  {
    id: "inv-003",
    name: "Salmón fresco",
    category: "Proteínas",
    unit: "kg",
    stock: 3,
    reserved: 3,
    available: 0,
    minStock: 5,
    maxStock: 20,
    status: "critical",
    lastEntry: "07:00",
    lots: [
      {
        id: "lot-004",
        itemId: "inv-003",
        quantity: 3,
        entryDate: "2026-09-10",
        expiryDate: "2026-09-12",
        supplier: "Mariscos del Pacífico",
        cost: 185.0,
        batchCode: "SAL-2026-090",
      },
    ],
  },
  {
    id: "inv-004",
    name: "Salsa de soya",
    category: "Salsas",
    unit: "L",
    stock: 12,
    reserved: 0,
    available: 12,
    minStock: 5,
    maxStock: 40,
    status: "available",
    lastEntry: "10:00",
    lots: [
      {
        id: "lot-005",
        itemId: "inv-004",
        quantity: 8,
        entryDate: "2026-09-01",
        expiryDate: "2027-03-01",
        supplier: "Distribuidora Asia",
        cost: 28.0,
        batchCode: "SS-2026-085",
      },
      {
        id: "lot-006",
        itemId: "inv-004",
        quantity: 4,
        entryDate: "2026-09-09",
        expiryDate: "2027-03-09",
        supplier: "Distribuidora Asia",
        cost: 28.5,
        batchCode: "SS-2026-089",
      },
    ],
  },
  {
    id: "inv-005",
    name: "Camarón Jumbo",
    category: "Proteínas",
    unit: "kg",
    stock: 8,
    reserved: 5,
    available: 3,
    minStock: 4,
    maxStock: 25,
    status: "reserved",
    lastEntry: "06:30",
    lots: [
      {
        id: "lot-007",
        itemId: "inv-005",
        quantity: 8,
        entryDate: "2026-09-10",
        expiryDate: "2026-09-13",
        supplier: "Mariscos del Pacífico",
        cost: 210.0,
        batchCode: "CJ-2026-090",
      },
    ],
  },
  {
    id: "inv-006",
    name: "Arroz Jazmín",
    category: "Base",
    unit: "kg",
    stock: 40,
    reserved: 0,
    available: 40,
    minStock: 15,
    maxStock: 80,
    status: "available",
    lastEntry: "11:00",
    lots: [
      {
        id: "lot-008",
        itemId: "inv-006",
        quantity: 25,
        entryDate: "2026-09-03",
        expiryDate: "2027-03-03",
        supplier: "Granos Premium",
        cost: 12.0,
        batchCode: "AJ-2026-086",
      },
      {
        id: "lot-009",
        itemId: "inv-006",
        quantity: 15,
        entryDate: "2026-09-09",
        expiryDate: "2027-03-09",
        supplier: "Granos Premium",
        cost: 12.5,
        batchCode: "AJ-2026-089",
      },
    ],
  },
  {
    id: "inv-007",
    name: "Tofu firme",
    category: "Proteínas",
    unit: "kg",
    stock: 6,
    reserved: 2,
    available: 4,
    minStock: 4,
    maxStock: 20,
    status: "available",
    lastEntry: "07:30",
    lots: [
      {
        id: "lot-010",
        itemId: "inv-007",
        quantity: 6,
        entryDate: "2026-09-10",
        expiryDate: "2026-09-14",
        supplier: "Tofu Fresh",
        cost: 35.0,
        batchCode: "TF-2026-090",
      },
    ],
  },
  {
    id: "inv-008",
    name: "Salsa de pescado",
    category: "Salsas",
    unit: "L",
    stock: 2,
    reserved: 0,
    available: 2,
    minStock: 3,
    maxStock: 15,
    status: "low",
    lastEntry: "08:00",
    lots: [
      {
        id: "lot-011",
        itemId: "inv-008",
        quantity: 2,
        entryDate: "2026-09-04",
        expiryDate: "2027-09-04",
        supplier: "Thai Imports",
        cost: 55.0,
        batchCode: "SP-2026-087",
      },
    ],
  },
  {
    id: "inv-009",
    name: "Alga Nori",
    category: "Base",
    unit: "paquetes",
    stock: 15,
    reserved: 3,
    available: 12,
    minStock: 10,
    maxStock: 50,
    status: "available",
    lastEntry: "09:00",
    lots: [
      {
        id: "lot-012",
        itemId: "inv-009",
        quantity: 15,
        entryDate: "2026-09-07",
        expiryDate: "2027-01-07",
        supplier: "Distribuidora Asia",
        cost: 22.0,
        batchCode: "AN-2026-088",
      },
    ],
  },
  {
    id: "inv-010",
    name: "Leche de coco",
    category: "Lácteos",
    unit: "L",
    stock: 8,
    reserved: 2,
    available: 6,
    minStock: 6,
    maxStock: 30,
    status: "available",
    lastEntry: "10:30",
    lots: [
      {
        id: "lot-013",
        itemId: "inv-010",
        quantity: 8,
        entryDate: "2026-09-09",
        expiryDate: "2027-03-09",
        supplier: "Thai Imports",
        cost: 32.0,
        batchCode: "LC-2026-089",
      },
    ],
  },
  {
    id: "inv-011",
    name: "Gyozas congeladas",
    category: "Congelados",
    unit: "paquetes",
    stock: 4,
    reserved: 2,
    available: 2,
    minStock: 8,
    maxStock: 40,
    status: "critical",
    lastEntry: "06:00",
    lots: [
      {
        id: "lot-014",
        itemId: "inv-011",
        quantity: 4,
        entryDate: "2026-09-06",
        expiryDate: "2026-12-06",
        supplier: "Frozen Asia",
        cost: 68.0,
        batchCode: "GY-2026-087",
      },
    ],
  },
  {
    id: "inv-012",
    name: "Aceite de sésamo",
    category: "Aceites",
    unit: "L",
    stock: 3,
    reserved: 0,
    available: 3,
    minStock: 2,
    maxStock: 10,
    status: "available",
    lastEntry: "08:45",
    lots: [
      {
        id: "lot-015",
        itemId: "inv-012",
        quantity: 3,
        entryDate: "2026-09-05",
        expiryDate: "2027-09-05",
        supplier: "Distribuidora Asia",
        cost: 48.0,
        batchCode: "AS-2026-087",
      },
    ],
  },
];

export const inventoryStatusMeta: Record<
  InventoryItemStatus,
  {
    label: string;
    tone: "success" | "info" | "warning" | "danger" | "neutral";
    description: string;
  }
> = {
  available: {
    label: "Disponible",
    tone: "success",
    description: "Stock dentro del rango normal",
  },
  low: {
    label: "Bajo",
    tone: "warning",
    description: "Stock por debajo del mínimo",
  },
  critical: {
    label: "Crítico",
    tone: "danger",
    description: "Stock muy bajo o agotado",
  },
  reserved: {
    label: "Reservado",
    tone: "info",
    description: "Stock asignado a pedidos activos",
  },
  expired: {
    label: "Caducado",
    tone: "neutral",
    description: "Lote vencido, requiere retiro",
  },
};

export const inventoryCategories = [
  "Todos",
  "Base",
  "Salsas",
  "Proteínas",
  "Lácteos",
  "Congelados",
  "Aceites",
];

export const getInventorySummary = (items: InventoryItem[]) => ({
  total: items.length,
  available: items.filter((i) => i.status === "available").length,
  low: items.filter((i) => i.status === "low").length,
  critical: items.filter((i) => i.status === "critical").length,
  reserved: items.filter((i) => i.status === "reserved").length,
  expired: items.filter((i) => i.status === "expired").length,
});

export const inventoryMovements: InventoryMovement[] = [
  {
    id: "imv-001",
    itemId: "inv-001",
    itemName: "Fideos de arroz",
    type: "entry",
    quantity: 15,
    createdBy: "Antony",
    createdAt: "09:30",
  },
  {
    id: "imv-002",
    itemId: "inv-003",
    itemName: "Salmón fresco",
    type: "adjustment",
    quantity: -2,
    lotId: "lot-004",
    reason: "Daño por manipulación",
    createdBy: "Sofia M.",
    createdAt: "10:15",
  },
  {
    id: "imv-003",
    itemId: "inv-005",
    itemName: "Camarón Jumbo",
    type: "output",
    quantity: -5,
    createdBy: "Sistema",
    createdAt: "11:00",
  },
  {
    id: "imv-004",
    itemId: "inv-002",
    itemName: "Pasta de curry rojo",
    type: "entry",
    quantity: 5,
    createdBy: "Antony",
    createdAt: "08:15",
  },
  {
    id: "imv-005",
    itemId: "inv-008",
    itemName: "Salsa de pescado",
    type: "adjustment",
    quantity: -1,
    lotId: "lot-011",
    reason: "Corrección de conteo",
    createdBy: "Antony",
    createdAt: "08:00",
  },
];

export const formatGTQ = (amount: number) =>
  new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(amount);
