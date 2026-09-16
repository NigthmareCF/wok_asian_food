export type DishStatus =
  "Publicado" | "Borrador" | "No disponible" | "Restringido";
export type Dish = {
  id: string;
  name: string;
  categoryId: string;
  price: number;
  description: string;
  image: string;
  options: string[];
  status: DishStatus;
};
export type Category = { id: string; name: string };
export type Ingredient = {
  id: string;
  name: string;
  unit: string;
  stock: number;
};
export type Recipe = {
  id: string;
  name: string;
  version: number;
  status: "Borrador" | "Vigente" | "Histórica";
  yield: number;
  effectiveDate: string;
  components: { ingredientId: string; quantity: number }[];
};
export type Supplier = {
  id: string;
  name: string;
  contact: string;
  email: string;
  phone: string;
  products: string[];
  preferred: boolean;
  status: "Activo" | "Incidencia";
};
export type Purchase = {
  id: string;
  supplierId: string;
  date: string;
  status: "Solicitada" | "Comprada" | "Parcial" | "Recibida" | "Cancelada";
  lines: {
    ingredientId: string;
    quantity: number;
    received: number;
    cost: number;
  }[];
};
export type Production = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  minutes: number;
  reason: string;
  status: "Sugerida" | "Aceptada" | "Activa" | "Completada" | "Descartada";
};
export type ClientRecord = {
  id: string;
  name: string;
  email: string;
  status: "Activo" | "Eliminado" | "Suspendido";
  orders: { id: string; date: string; total: number }[];
  incidents: { id: string; date: string; reason: string }[];
  restrictions: {
    id: string;
    scope: string;
    reason: string;
    active: boolean;
  }[];
};
export type CashClosing = {
  id: string;
  date: string;
  actor: string;
  opening: number;
  sales: number;
  income: number;
  expenses: number;
  withdrawals: number;
  counted: number;
  reviewed: boolean;
  note: string;
};
export type Settings = {
  opening: string;
  closing: string;
  closed: boolean;
  reservationLimit: number;
  tolerance: number;
  tip: number;
  deliveryEnabled: boolean;
  reservationPolicy: string;
};
export type Template = {
  id: string;
  name: string;
  channel: string;
  content: string;
  enabled: boolean;
};
export type Signal = {
  id: string;
  camera: string;
  date: string;
  description: string;
  confidence: number;
  lowConfidence: boolean;
  available: boolean;
  status: "Pendiente" | "Confirmada" | "Rechazada";
  reason: string;
};
export type AuditEvent = {
  id: string;
  date: string;
  actor: string;
  action: string;
  entity: string;
  before: string;
  after: string;
  reason: string;
  result: string;
};
export type SalesRecord = {
  date: string;
  channel: string;
  orders: number;
  sales: number;
  costs: number;
};
export type AdminState = {
  categories: Category[];
  dishes: Dish[];
  ingredients: Ingredient[];
  recipes: Recipe[];
  suppliers: Supplier[];
  purchases: Purchase[];
  productions: Production[];
  clients: ClientRecord[];
  closings: CashClosing[];
  settings: Settings;
  templates: Template[];
  signals: Signal[];
  audit: AuditEvent[];
  sales: SalesRecord[];
};
export type AuditInput = Pick<
  AuditEvent,
  "action" | "entity" | "before" | "after" | "reason"
>;

export function expectedCash(closing: CashClosing) {
  return (
    closing.opening +
    closing.sales +
    closing.income -
    closing.expenses -
    closing.withdrawals
  );
}
export function recipeError(recipe: Recipe, ingredients: Ingredient[]) {
  if (
    !recipe.name.trim() ||
    !Number.isFinite(recipe.yield) ||
    recipe.yield <= 0 ||
    !recipe.effectiveDate
  )
    return "Completa nombre, rendimiento positivo y fecha de vigencia.";
  if (!recipe.components.length) return "Agrega al menos un componente.";
  if (
    new Set(recipe.components.map((c) => c.ingredientId)).size !==
    recipe.components.length
  )
    return "No repitas ingredientes en la receta.";
  if (
    recipe.components.some(
      (c) =>
        !ingredients.some((i) => i.id === c.ingredientId) ||
        !Number.isFinite(c.quantity) ||
        c.quantity <= 0,
    )
  )
    return "Hay una dependencia inválida o una cantidad no positiva.";
  return "";
}
export function receivePurchase(
  state: AdminState,
  id: string,
  quantities: number[],
): AdminState {
  const purchase = state.purchases.find((p) => p.id === id);
  if (!purchase || !["Comprada", "Parcial"].includes(purchase.status))
    throw new Error(
      "Solo puedes recibir compras registradas con saldo pendiente.",
    );
  if (
    quantities.length !== purchase.lines.length ||
    !quantities.some((q) => q > 0) ||
    quantities.some(
      (q, i) =>
        !Number.isFinite(q) ||
        q < 0 ||
        q > purchase.lines[i].quantity - purchase.lines[i].received,
    )
  )
    throw new Error(
      "Las cantidades deben ser positivas y no superar el saldo pendiente.",
    );
  const lines = purchase.lines.map((line, i) => ({
    ...line,
    received: line.received + quantities[i],
  }));
  return {
    ...state,
    purchases: state.purchases.map((p) =>
      p.id === id
        ? {
            ...p,
            lines,
            status: lines.every((l) => l.received === l.quantity)
              ? "Recibida"
              : "Parcial",
          }
        : p,
    ),
    ingredients: state.ingredients.map((ingredient) => ({
      ...ingredient,
      stock:
        ingredient.stock +
        purchase.lines.reduce(
          (sum, line, i) =>
            sum + (line.ingredientId === ingredient.id ? quantities[i] : 0),
          0,
        ),
    })),
  };
}
export function settingsError(settings: Settings) {
  if (
    !settings.closed &&
    (!settings.opening ||
      !settings.closing ||
      settings.opening >= settings.closing)
  )
    return "La hora de cierre debe ser posterior a la apertura en esta demostración de horario diurno.";
  if (
    ![settings.reservationLimit, settings.tolerance, settings.tip].every(
      Number.isFinite,
    ) ||
    settings.reservationLimit < 1 ||
    !Number.isInteger(settings.reservationLimit) ||
    settings.tolerance < 0 ||
    settings.tip < 0 ||
    settings.tip > 100
  )
    return "Revisa el límite de reservas, la tolerancia y la propina (0–100%).";
  if (!settings.reservationPolicy.trim())
    return "Escribe la política de reservaciones.";
  return "";
}
