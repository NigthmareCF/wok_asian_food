export type StaffAvailabilityStatus = "planned" | "available" | "absent";

export type StaffEditState = "unchanged" | "dirty" | "saving";

export type StaffMember = {
  availabilityStatus: StaffAvailabilityStatus;
  id: string;
  name: string;
};

export type StaffShift = {
  date: string;
  endTime: string;
  id: string;
  kind: "regular" | "special";
  staffId: string;
  startTime: string;
};

export type StaffAbsence = {
  date: string;
  id: string;
  reason?: string;
  staffId: string;
};

export type StaffAuditEntry = {
  actor: string;
  id: string;
  operation:
    | "schedule-update"
    | "special-shift-create"
    | "special-shift-update"
    | "absence-create";
  performedAt: string;
  reason?: string;
  staffId: string;
};

export type StaffWeek = {
  endDate: string;
  id: string;
  label: string;
  startDate: string;
};

export const staffAvailabilityLabels: Record<StaffAvailabilityStatus, string> =
  {
    absent: "Ausente",
    available: "Disponible",
    planned: "Previsto",
  };

export const dummyStaffWeeks: StaffWeek[] = [
  {
    endDate: "2026-09-13",
    id: "week-2026-09-07",
    label: "7 al 13 de septiembre de 2026",
    startDate: "2026-09-07",
  },
  {
    endDate: "2026-09-20",
    id: "week-2026-09-14",
    label: "14 al 20 de septiembre de 2026",
    startDate: "2026-09-14",
  },
  {
    endDate: "2026-09-27",
    id: "week-2026-09-21",
    label: "21 al 27 de septiembre de 2026",
    startDate: "2026-09-21",
  },
];

export const dummyStaffMembers: StaffMember[] = [
  {
    availabilityStatus: "planned",
    id: "staff-ana",
    name: "Ana Rodriguez",
  },
  {
    availabilityStatus: "available",
    id: "staff-carlos",
    name: "Carlos Mendez",
  },
  {
    availabilityStatus: "absent",
    id: "staff-marina",
    name: "Marina Lopez",
  },
];

export const dummyStaffShifts: StaffShift[] = [
  {
    date: "2026-09-07",
    endTime: "14:00",
    id: "shift-ana-0907",
    kind: "regular",
    staffId: "staff-ana",
    startTime: "09:00",
  },
  {
    date: "2026-09-08",
    endTime: "15:00",
    id: "shift-ana-0908",
    kind: "regular",
    staffId: "staff-ana",
    startTime: "10:00",
  },
  {
    date: "2026-09-09",
    endTime: "20:00",
    id: "shift-ana-0909-special",
    kind: "special",
    staffId: "staff-ana",
    startTime: "16:00",
  },
  {
    date: "2026-09-14",
    endTime: "14:00",
    id: "shift-ana-0914",
    kind: "regular",
    staffId: "staff-ana",
    startTime: "09:00",
  },
  {
    date: "2026-09-15",
    endTime: "15:00",
    id: "shift-ana-0915",
    kind: "regular",
    staffId: "staff-ana",
    startTime: "10:00",
  },
  {
    date: "2026-09-07",
    endTime: "18:00",
    id: "shift-carlos-0907",
    kind: "regular",
    staffId: "staff-carlos",
    startTime: "12:00",
  },
  {
    date: "2026-09-10",
    endTime: "21:00",
    id: "shift-carlos-0910-special",
    kind: "special",
    staffId: "staff-carlos",
    startTime: "17:00",
  },
  {
    date: "2026-09-16",
    endTime: "18:00",
    id: "shift-carlos-0916",
    kind: "regular",
    staffId: "staff-carlos",
    startTime: "12:00",
  },
];

export const dummyStaffAbsences: StaffAbsence[] = [
  {
    date: "2026-09-11",
    id: "absence-marina-0911",
    reason: "Registro simulado",
    staffId: "staff-marina",
  },
];

export const initialStaffAuditEntries: StaffAuditEntry[] = [
  {
    actor: "Administracion demo",
    id: "staff-audit-1",
    operation: "schedule-update",
    performedAt: "2026-09-07 09:20",
    reason: "Motivo simulado",
    staffId: "staff-ana",
  },
];
