export type AdminPeriod = "today" | "week" | "month";

export type AdminMetric = {
  id: string;
  label: string;
  value: string;
  detail: string;
};

export type AdminDashboardItem = {
  id: string;
  title: string;
  detail: string;
};

export type AdminDashboardData = {
  period: AdminPeriod;
  periodLabel: string;
  metrics: AdminMetric[];
  alerts: AdminDashboardItem[];
  criticalProducts: AdminDashboardItem[];
  suggestedPurchases: AdminDashboardItem[];
  suggestedProductions: AdminDashboardItem[];
};

export const adminPeriods: { value: AdminPeriod; label: string }[] = [
  { value: "today", label: "Hoy" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
];

const buildMetrics = (
  alerts: AdminDashboardItem[],
  criticalProducts: AdminDashboardItem[],
  suggestedPurchases: AdminDashboardItem[],
  suggestedProductions: AdminDashboardItem[],
): AdminMetric[] => [
  {
    id: "alerts",
    label: "Alertas",
    value: String(alerts.length),
    detail: "Revisión administrativa",
  },
  {
    id: "critical-products",
    label: "Productos críticos",
    value: String(criticalProducts.length),
    detail: "Seguimiento pendiente",
  },
  {
    id: "suggested-purchases",
    label: "Compras sugeridas",
    value: String(suggestedPurchases.length),
    detail: "Datos simulados",
  },
  {
    id: "suggested-productions",
    label: "Producciones sugeridas",
    value: String(suggestedProductions.length),
    detail: "Datos simulados",
  },
];

const todayAlerts: AdminDashboardItem[] = [
  {
    id: "alert-service",
    title: "Revisión del servicio",
    detail: "Hay información operativa que requiere validación administrativa.",
  },
  {
    id: "alert-stock",
    title: "Seguimiento de inventario",
    detail: "Existen productos marcados como críticos en los datos simulados.",
  },
];

const todayCriticalProducts: AdminDashboardItem[] = [
  {
    id: "critical-salmon",
    title: "Salmón",
    detail: "Producto marcado como crítico para revisión.",
  },
  {
    id: "critical-rice",
    title: "Arroz jazmín",
    detail: "Producto marcado como crítico para revisión.",
  },
  {
    id: "critical-tea",
    title: "Té verde",
    detail: "Producto marcado como crítico para revisión.",
  },
];

const todaySuggestedPurchases: AdminDashboardItem[] = [
  {
    id: "purchase-seafood",
    title: "Insumos de cocina",
    detail: "Compra sugerida por datos simulados.",
  },
  {
    id: "purchase-beverages",
    title: "Bebidas",
    detail: "Compra sugerida por datos simulados.",
  },
];

const todaySuggestedProductions: AdminDashboardItem[] = [
  {
    id: "production-base",
    title: "Preparación base",
    detail: "Producción sugerida por datos simulados.",
  },
  {
    id: "production-service",
    title: "Preparación para servicio",
    detail: "Producción sugerida por datos simulados.",
  },
];

const weeklyAlerts: AdminDashboardItem[] = [
  {
    id: "alert-weekly-review",
    title: "Revisión semanal",
    detail: "Resumen simulado con elementos pendientes del período.",
  },
];

const weeklyCriticalProducts: AdminDashboardItem[] = [
  {
    id: "critical-weekly-salmon",
    title: "Salmón",
    detail: "Producto marcado como crítico para revisión.",
  },
  {
    id: "critical-weekly-rice",
    title: "Arroz jazmín",
    detail: "Producto marcado como crítico para revisión.",
  },
];

const weeklySuggestedPurchases: AdminDashboardItem[] = [
  {
    id: "purchase-weekly-kitchen",
    title: "Insumos de cocina",
    detail: "Compra sugerida por datos simulados.",
  },
];

const weeklySuggestedProductions: AdminDashboardItem[] = [
  {
    id: "production-weekly-service",
    title: "Preparación para servicio",
    detail: "Producción sugerida por datos simulados.",
  },
];

export const adminDashboardData: Record<AdminPeriod, AdminDashboardData> = {
  today: {
    period: "today",
    periodLabel: "Hoy",
    metrics: buildMetrics(
      todayAlerts,
      todayCriticalProducts,
      todaySuggestedPurchases,
      todaySuggestedProductions,
    ),
    alerts: todayAlerts,
    criticalProducts: todayCriticalProducts,
    suggestedPurchases: todaySuggestedPurchases,
    suggestedProductions: todaySuggestedProductions,
  },
  week: {
    period: "week",
    periodLabel: "Semana",
    metrics: buildMetrics(
      weeklyAlerts,
      weeklyCriticalProducts,
      weeklySuggestedPurchases,
      weeklySuggestedProductions,
    ),
    alerts: weeklyAlerts,
    criticalProducts: weeklyCriticalProducts,
    suggestedPurchases: weeklySuggestedPurchases,
    suggestedProductions: weeklySuggestedProductions,
  },
  month: {
    period: "month",
    periodLabel: "Mes",
    metrics: buildMetrics([], [], [], []),
    alerts: [],
    criticalProducts: [],
    suggestedPurchases: [],
    suggestedProductions: [],
  },
};
