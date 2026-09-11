export type CashMovementType = "income" | "expense" | "withdrawal" | "deposit";
export type CashMovementStatus = "pending" | "confirmed" | "cancelled";

export type CashMovement = {
  id: string;
  type: CashMovementType;
  amount: number;
  description: string;
  category?: string;
  status: CashMovementStatus;
  createdAt: string;
  createdBy: string;
  reference?: string;
};

export type CashSession = {
  id: string;
  date: string;
  openedAt: string;
  openedBy: string;
  initialAmount: number;
  currentAmount: number;
  expectedAmount: number;
  difference: number;
  status: "open" | "closing" | "closed";
  movements: CashMovement[];
  closedAt?: string;
  closedBy?: string;
  closingNotes?: string;
};

export type CashSummary = {
  totalIncome: number;
  totalExpenses: number;
  totalWithdrawals: number;
  totalDeposits: number;
  netCash: number;
  expectedCash: number;
  difference: number;
};

export const cashCategories = {
  income: ["Venta mesa", "Venta delivery", "Venta recoger", "Propina", "Otro ingreso"],
  expense: ["Compra insumos", "Pago proveedor", "Servicios", "Mantenimiento", "Otro gasto"],
  withdrawal: ["Retiro personal", "Cambio de turno", "Fondo de caja", "Otro retiro"],
  deposit: ["Depósito banco", "Ingreso efectivo", "Otro depósito"],
};

export const initialCashSession: CashSession = {
  id: "cash-2026-09-10",
  date: "2026-09-10",
  openedAt: "08:00",
  openedBy: "Antony",
  initialAmount: 500,
  currentAmount: 2847,
  expectedAmount: 2850,
  difference: -3,
  status: "open",
  movements: [
    {
      id: "mov-1",
      type: "income",
      amount: 314,
      description: "Cobro Mesa 7 (A-104)",
      category: "Venta mesa",
      status: "confirmed",
      createdAt: "13:22",
      createdBy: "Sofia M.",
      reference: "A-104",
    },
    {
      id: "mov-2",
      type: "income",
      amount: 244,
      description: "Cobro Delivery D-088",
      category: "Venta delivery",
      status: "confirmed",
      createdAt: "13:05",
      createdBy: "Sistema",
      reference: "D-088",
    },
    {
      id: "mov-3",
      type: "income",
      amount: 165,
      description: "Cobro Mesa 3 (A-106)",
      category: "Venta mesa",
      status: "confirmed",
      createdAt: "13:20",
      createdBy: "Sofia M.",
      reference: "A-106",
    },
    {
      id: "mov-4",
      type: "expense",
      amount: 120,
      description: "Compra verduras fresco",
      category: "Compra insumos",
      status: "confirmed",
      createdAt: "10:15",
      createdBy: "Antony",
    },
    {
      id: "mov-5",
      type: "withdrawal",
      amount: 200,
      description: "Cambio de turno - Luis",
      category: "Cambio de turno",
      status: "confirmed",
      createdAt: "12:00",
      createdBy: "Antony",
    },
    {
      id: "mov-6",
      type: "income",
      amount: 196,
      description: "Cobro Mesa 9 (A-099) - diferencia +4",
      category: "Venta mesa",
      status: "confirmed",
      createdAt: "13:15",
      createdBy: "Marco R.",
      reference: "A-099",
    },
    {
      id: "mov-7",
      type: "expense",
      amount: 85,
      description: "Pago gas",
      category: "Servicios",
      status: "confirmed",
      createdAt: "11:30",
      createdBy: "Antony",
    },
    {
      id: "mov-8",
      type: "income",
      amount: 562,
      description: "Cobro parcial Mesa 5 (A-105)",
      category: "Venta mesa",
      status: "confirmed",
      createdAt: "13:12",
      createdBy: "Luis A.",
      reference: "A-105",
    },
  ],
};

export const getCashSummary = (session: CashSession): CashSummary => {
  const income = session.movements
    .filter((m) => m.type === "income" && m.status === "confirmed")
    .reduce((sum, m) => sum + m.amount, 0);
  const expenses = session.movements
    .filter((m) => m.type === "expense" && m.status === "confirmed")
    .reduce((sum, m) => sum + m.amount, 0);
  const withdrawals = session.movements
    .filter((m) => m.type === "withdrawal" && m.status === "confirmed")
    .reduce((sum, m) => sum + m.amount, 0);
  const deposits = session.movements
    .filter((m) => m.type === "deposit" && m.status === "confirmed")
    .reduce((sum, m) => sum + m.amount, 0);

  const netCash = income - expenses - withdrawals + deposits;
  const expectedCash = session.initialAmount + netCash;
  const difference = session.currentAmount - expectedCash;

  return {
    totalIncome: income,
    totalExpenses: expenses,
    totalWithdrawals: withdrawals,
    totalDeposits: deposits,
    netCash,
    expectedCash,
    difference,
  };
};

export const formatGTQ = (amount: number) =>
  new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(amount);