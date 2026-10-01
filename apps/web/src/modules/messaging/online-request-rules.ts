import type { OnlineRequestRecord } from "@/data/fixtures/messaging";
import type { OperationalTable } from "@/data/fixtures/operation";
import type { ServiceStatusValue } from "@/data/fixtures/production";

export type OnlineRequestRuleIssue =
  | "suspended"
  | "pickup-only-blocked"
  | "out-of-hours"
  | "table-unavailable"
  | "high-demand";

export type OnlineRequestRuleResult = {
  blocked: OnlineRequestRuleIssue[];
  warnings: OnlineRequestRuleIssue[];
};

export const serviceHours = { opening: 11, closing: 22 } as const;

const issueMessages: Record<OnlineRequestRuleIssue, string> = {
  suspended: "El restaurante tiene los servicios suspendidos.",
  "pickup-only-blocked":
    "El modo actual solo permite pedidos para recoger.",
  "out-of-hours":
    "La solicitud queda fuera del horario de servicio (11:00 a 22:00).",
  "table-unavailable":
    "No hay mesa disponible con capacidad suficiente para la hora solicitada.",
  "high-demand":
    "Alta demanda: los tiempos de espera son más largos.",
};

export const noProcedeMessage =
  "No procede según las reglas actuales (horario, estado del servicio o disponibilidad de mesas).";

export const onlineRequestIssueLabel: Record<OnlineRequestRuleIssue, string> = {
  suspended: "Servicios suspendidos",
  "pickup-only-blocked": "Solo recoger",
  "out-of-hours": "Fuera de horario",
  "table-unavailable": "Mesa no disponible",
  "high-demand": "Alta demanda",
};

export function getOnlineRequestIssueMessage(issue: OnlineRequestRuleIssue) {
  return issueMessages[issue];
}

const parseHour = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours + (Number.isFinite(minutes) ? minutes / 60 : 0);
};

const isWithinServiceHours = (request: OnlineRequestRecord) => {
  const hour = parseHour(request.time);
  return hour >= serviceHours.opening && hour < serviceHours.closing;
};

const findAvailableTable = (
  request: OnlineRequestRecord,
  tables: OperationalTable[],
) =>
  tables.find(
    (table) =>
      table.status === "free" &&
      table.capacity >= Math.max(request.people, 1),
  );

export function evaluateOnlineRequestRules(
  request: OnlineRequestRecord,
  context: {
    serviceStatus: ServiceStatusValue;
    tables: OperationalTable[];
  },
): OnlineRequestRuleResult {
  const blocked: OnlineRequestRuleIssue[] = [];
  const warnings: OnlineRequestRuleIssue[] = [];

  if (context.serviceStatus === "suspended") {
    blocked.push("suspended");
  } else {
    if (context.serviceStatus === "high-demand") {
      warnings.push("high-demand");
    }
    if (context.serviceStatus === "pickup-only" && request.kind !== "pickup") {
      blocked.push("pickup-only-blocked");
    }
    if (!isWithinServiceHours(request)) {
      blocked.push("out-of-hours");
    }
    if (
      (request.kind === "dine-in" || request.kind === "reservation") &&
      !findAvailableTable(request, context.tables)
    ) {
      blocked.push("table-unavailable");
    }
  }

  return { blocked, warnings };
}

export function getAvailableTableForRequest(
  request: OnlineRequestRecord,
  tables: OperationalTable[],
) {
  return findAvailableTable(request, tables);
}