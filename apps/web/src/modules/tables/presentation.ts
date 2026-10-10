import { type OperationalTable } from "./live-contract";

const accountStatusLabels = {
  OPEN: "Abierta",
  IN_COBRO: "En cobro",
  PAID: "Pagada",
  CLOSED: "Cerrada",
} as const;

export function formatTableAccount(table: OperationalTable): string {
  return table.accountName && table.accountStatus
    ? `${table.accountName} · ${accountStatusLabels[table.accountStatus]}`
    : "Sin cuenta abierta";
}

export function formatAccountStatus(status: string): string {
  return Object.hasOwn(accountStatusLabels, status)
    ? accountStatusLabels[status as keyof typeof accountStatusLabels]
    : "Estado no reconocido";
}
