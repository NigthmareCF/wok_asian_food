export type ProductionBatchStatus =
  | "pending"
  | "active"
  | "resting"
  | "completed"
  | "discarded";

export type ProductionBatch = {
  id: string;
  recipeName: string;
  category: string;
  status: ProductionBatchStatus;
  quantityExpected: number;
  quantityActual: number;
  unit: string;
  yieldPercent: number;
  startedAt: string;
  completedAt?: string;
  restingUntil?: string;
  createdBy: string;
  responsible: string;
  notes?: string;
  discardReason?: string;
  suggestionId?: string;
};

export type ProductionSuggestion = {
  id: string;
  recipeName: string;
  category: string;
  reason: string;
  suggestedQuantity: number;
  unit: string;
  priority: "high" | "medium" | "low";
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
};

export type ProductionMovementType =
  | "start"
  | "pause"
  | "resume"
  | "complete"
  | "discard"
  | "adjust";

export type ProductionMovement = {
  id: string;
  batchId: string;
  type: ProductionMovementType;
  quantity?: number;
  note?: string;
  createdBy: string;
  createdAt: string;
};

export const productionBatches: ProductionBatch[] = [
  {
    id: "bat-001",
    recipeName: "Salsa teriyaki",
    category: "Salsas",
    status: "active",
    quantityExpected: 8,
    quantityActual: 0,
    unit: "L",
    yieldPercent: 0,
    startedAt: "09:00",
    createdBy: "Carlos M.",
    responsible: "Carlos M.",
    notes: "Lote doble para cubrir fin de semana",
  },
  {
    id: "bat-002",
    recipeName: "Marinada para pollo",
    category: "Preparados",
    status: "active",
    quantityExpected: 5,
    quantityActual: 0,
    unit: "kg",
    yieldPercent: 0,
    startedAt: "09:30",
    createdBy: "Carlos M.",
    responsible: "Carlos M.",
  },
  {
    id: "bat-003",
    recipeName: "Wok base de verduras",
    category: "Preparados",
    status: "resting",
    quantityExpected: 10,
    quantityActual: 9.5,
    unit: "kg",
    yieldPercent: 95,
    startedAt: "07:00",
    completedAt: "08:15",
    restingUntil: "12:00",
    createdBy: "María G.",
    responsible: "María G.",
    notes: "Enfriando antes de porcionar",
  },
  {
    id: "bat-004",
    recipeName: "Caldo dashi",
    category: "Bases",
    status: "completed",
    quantityExpected: 15,
    quantityActual: 14.2,
    unit: "L",
    yieldPercent: 94.7,
    startedAt: "06:00",
    completedAt: "08:30",
    createdBy: "María G.",
    responsible: "María G.",
  },
  {
    id: "bat-005",
    recipeName: "Salsa picante",
    category: "Salsas",
    status: "pending",
    quantityExpected: 4,
    quantityActual: 0,
    unit: "L",
    yieldPercent: 0,
    startedAt: "",
    createdBy: "Antony",
    responsible: "Carlos M.",
    notes: "Esperando ingrediente principal",
  },
  {
    id: "bat-006",
    recipeName: "Arroz para sushi",
    category: "Bases",
    status: "completed",
    quantityExpected: 12,
    quantityActual: 11.8,
    unit: "kg",
    yieldPercent: 98.3,
    startedAt: "05:30",
    completedAt: "07:00",
    createdBy: "María G.",
    responsible: "María G.",
  },
  {
    id: "bat-007",
    recipeName: "Pasta de curry verde",
    category: "Salsas",
    status: "discarded",
    quantityExpected: 6,
    quantityActual: 3,
    unit: "kg",
    yieldPercent: 50,
    startedAt: "10:00",
    completedAt: "10:45",
    createdBy: "Carlos M.",
    responsible: "Carlos M.",
    discardReason: "Proporción incorrecta de especias, no se puede corregir",
  },
];

export const productionSuggestions: ProductionSuggestion[] = [
  {
    id: "sug-001",
    recipeName: "Salsa teriyaki",
    category: "Salsas",
    reason: "Stock por debajo del mínimo para servicio de mañana",
    suggestedQuantity: 10,
    unit: "L",
    priority: "high",
    status: "pending",
    createdAt: "08:00",
  },
  {
    id: "sug-002",
    recipeName: "Marinada para pollo",
    category: "Preparados",
    reason: "Pedidos pendientes requieren 3 kg adicionales",
    suggestedQuantity: 6,
    unit: "kg",
    priority: "medium",
    status: "pending",
    createdAt: "09:15",
  },
  {
    id: "sug-003",
    recipeName: "Wok base de verduras",
    category: "Preparados",
    reason: "Demanda del fin de semana estimada en 20 kg",
    suggestedQuantity: 15,
    unit: "kg",
    priority: "low",
    status: "accepted",
    createdAt: "07:30",
  },
  {
    id: "sug-004",
    recipeName: "Salsa picante",
    category: "Salsas",
    reason: "Stock agotado, útil para múltiples platos",
    suggestedQuantity: 5,
    unit: "L",
    priority: "high",
    status: "rejected",
    createdAt: "06:45",
  },
];

export const productionStatusMeta: Record<
  ProductionBatchStatus,
  {
    label: string;
    tone: "success" | "info" | "warning" | "danger" | "neutral";
    description: string;
  }
> = {
  pending: {
    label: "Pendiente",
    tone: "info",
    description: "Batch registrado, esperando iniciar",
  },
  active: {
    label: "Activa",
    tone: "warning",
    description: "Producción en curso",
  },
  resting: {
    label: "Reposo",
    tone: "info",
    description: "Enfriando o descansando antes de siguiente paso",
  },
  completed: {
    label: "Completada",
    tone: "success",
    description: "Producción finalizada y lista para uso",
  },
  discarded: {
    label: "Descartada",
    tone: "danger",
    description: "Batch descartado por error o calidad",
  },
};

export const productionCategories = [
  "Todos",
  "Salsas",
  "Preparados",
  "Bases",
];

export const getProductionSummary = (batches: ProductionBatch[]) => ({
  total: batches.length,
  pending: batches.filter((b) => b.status === "pending").length,
  active: batches.filter((b) => b.status === "active").length,
  resting: batches.filter((b) => b.status === "resting").length,
  completed: batches.filter((b) => b.status === "completed").length,
  discarded: batches.filter((b) => b.status === "discarded").length,
});

export const getProductionMovements = (
  batchId: string,
): ProductionMovement[] =>
  productionMovements.filter((m) => m.batchId === batchId);

export const productionMovements: ProductionMovement[] = [
  {
    id: "pmv-001",
    batchId: "bat-001",
    type: "start",
    createdBy: "Carlos M.",
    createdAt: "09:00",
  },
  {
    id: "pmv-002",
    batchId: "bat-002",
    type: "start",
    createdBy: "Carlos M.",
    createdAt: "09:30",
  },
  {
    id: "pmv-003",
    batchId: "bat-003",
    type: "start",
    createdBy: "María G.",
    createdAt: "07:00",
  },
  {
    id: "pmv-004",
    batchId: "bat-003",
    type: "complete",
    quantity: 9.5,
    note: "95% rendimiento, lote aceptado",
    createdBy: "María G.",
    createdAt: "08:15",
  },
  {
    id: "pmv-005",
    batchId: "bat-004",
    type: "start",
    createdBy: "María G.",
    createdAt: "06:00",
  },
  {
    id: "pmv-006",
    batchId: "bat-004",
    type: "complete",
    quantity: 14.2,
    note: "94.7% rendimiento",
    createdBy: "María G.",
    createdAt: "08:30",
  },
  {
    id: "pmv-007",
    batchId: "bat-007",
    type: "start",
    createdBy: "Carlos M.",
    createdAt: "10:00",
  },
  {
    id: "pmv-008",
    batchId: "bat-007",
    type: "discard",
    quantity: 3,
    note: "Proporción incorrecta de especias, no se puede corregir",
    createdBy: "Carlos M.",
    createdAt: "10:45",
  },
];

export const serviceStatusOptions = [
  {
    value: "normal",
    label: "Normal",
    description: "Servicio completo, todos los canales activos",
    icon: "check-circle",
    tone: "success" as const,
  },
  {
    value: "high-demand",
    label: "Alta demanda",
    description: "Tiempos de espera extendidos, personal prioritario",
    icon: "alert-triangle",
    tone: "warning" as const,
  },
  {
    value: "pickup-only",
    label: "Solo recoger",
    description: "Solo pedidos para recoger, sin mesas ni delivery",
    icon: "package",
    tone: "info" as const,
  },
  {
    value: "suspended",
    label: "Servicios suspendidos",
    description: "Todos los servicios temporalmente detenidos",
    icon: "x-circle",
    tone: "danger" as const,
  },
] as const;

export type ServiceStatusValue =
  (typeof serviceStatusOptions)[number]["value"];

export type ServiceStatusRecord = {
  currentStatus: ServiceStatusValue;
  reason: string;
  changedBy: string;
  changedAt: string;
  history: {
    status: ServiceStatusValue;
    reason: string;
    changedBy: string;
    changedAt: string;
  }[];
};

export const initialServiceStatus: ServiceStatusRecord = {
  currentStatus: "normal",
  reason: "Inicio de turno",
  changedBy: "Antony",
  changedAt: "08:00",
  history: [
    {
      status: "normal",
      reason: "Inicio de turno",
      changedBy: "Antony",
      changedAt: "08:00",
    },
    {
      status: "high-demand",
      reason: "Hora pico de almuerzo",
      changedBy: "Antony",
      changedAt: "12:00",
    },
    {
      status: "normal",
      reason: "Pico terminado",
      changedBy: "Sofia M.",
      changedAt: "13:30",
    },
  ],
};
