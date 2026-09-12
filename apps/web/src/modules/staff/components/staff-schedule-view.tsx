"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  LoaderCircle,
  Plus,
  Search,
  X,
} from "lucide-react";
import {
  dummyStaffAbsences,
  dummyStaffMembers,
  dummyStaffShifts,
  dummyStaffWeeks,
  initialStaffAuditEntries,
  staffAvailabilityLabels,
  type StaffAbsence,
  type StaffAuditEntry,
  type StaffEditState,
  type StaffMember,
  type StaffShift,
} from "@/data/fixtures/staff";
import { Button } from "@/shared/components/ui/button";
import { StatusBadge } from "@/shared/components/ui/status-badge";
import styles from "./staff-schedule.module.css";

type StaffDialogMode = "schedule" | "special" | "absence";
type PendingNavigation =
  { type: "person"; staffId: string } | { type: "week"; weekIndex: number };

type ShiftForm = {
  date: string;
  endTime: string;
  id: string;
  reason: string;
  startTime: string;
};

type AbsenceForm = {
  date: string;
  reason: string;
};

type FormErrors = {
  date?: string;
  endTime?: string;
  startTime?: string;
};

type WeekDay = {
  date: string;
  label: string;
};

const editStateLabels: Record<StaffEditState, string> = {
  dirty: "Cambio pendiente",
  saving: "Guardando",
  unchanged: "Sin cambios",
};

const auditOperationLabels: Record<StaffAuditEntry["operation"], string> = {
  "absence-create": "Ausencia",
  "schedule-update": "Horario editado",
  "special-shift-create": "Turno especial",
  "special-shift-update": "Turno especial editado",
};

function getWeekDays(weekStartDate: string): WeekDay[] {
  const baseDate = new Date(`${weekStartDate}T00:00:00`);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() + index);
    const isoDate = date.toISOString().slice(0, 10);
    return {
      date: isoDate,
      label: new Intl.DateTimeFormat("es-GT", {
        day: "2-digit",
        month: "short",
        weekday: "short",
      }).format(date),
    };
  });
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("aria-hidden"));
}

function handleDialogKeyDown(
  event: KeyboardEvent<HTMLElement>,
  onClose: () => void,
) {
  if (event.key === "Escape") {
    event.preventDefault();
    onClose();
    return;
  }

  if (event.key !== "Tab") {
    return;
  }

  const focusableElements = getFocusableElements(event.currentTarget);
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  if (!firstElement || !lastElement) {
    event.preventDefault();
    return;
  }

  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault();
    lastElement.focus();
  }

  if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus();
  }
}

function buildAuditEntry({
  operation,
  reason,
  staffId,
}: {
  operation: StaffAuditEntry["operation"];
  reason?: string;
  staffId: string;
}): StaffAuditEntry {
  return {
    actor: "Administracion demo",
    id: `STAFF-AUD-${Date.now()}`,
    operation,
    performedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    reason: reason?.trim() || undefined,
    staffId,
  };
}

function buildNewShift({
  form,
  kind,
  staffId,
}: {
  form: ShiftForm;
  kind: StaffShift["kind"];
  staffId: string;
}): StaffShift {
  return {
    date: form.date,
    endTime: form.endTime,
    id: form.id || `shift-${staffId}-${Date.now()}`,
    kind,
    staffId,
    startTime: form.startTime,
  };
}

function validateShiftForm(form: ShiftForm): FormErrors {
  return {
    date: form.date ? undefined : "La fecha es requerida.",
    endTime: form.endTime ? undefined : "La hora de finalizacion es requerida.",
    startTime: form.startTime ? undefined : "La hora de inicio es requerida.",
  };
}

function validateAbsenceForm(form: AbsenceForm): FormErrors {
  return {
    date: form.date ? undefined : "La fecha es requerida.",
  };
}

function hasErrors(errors: FormErrors) {
  return Object.values(errors).some(Boolean);
}

export function StaffScheduleView() {
  const [staffMembers] = useState<StaffMember[]>(dummyStaffMembers);
  const [shifts, setShifts] = useState<StaffShift[]>(dummyStaffShifts);
  const [absences, setAbsences] = useState<StaffAbsence[]>(dummyStaffAbsences);
  const [auditEntries, setAuditEntries] = useState<StaffAuditEntry[]>(
    initialStaffAuditEntries,
  );
  const [query, setQuery] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState(staffMembers[0]?.id);
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);
  const [editState, setEditState] = useState<StaffEditState>("unchanged");
  const [dialogMode, setDialogMode] = useState<StaffDialogMode | null>(null);
  const [selectedShiftId, setSelectedShiftId] = useState("");
  const [shiftDraft, setShiftDraft] = useState<ShiftForm>({
    date: dummyStaffWeeks[0]?.startDate ?? "",
    endTime: "",
    id: "",
    reason: "",
    startTime: "",
  });
  const [absenceDraft, setAbsenceDraft] = useState<AbsenceForm>({
    date: dummyStaffWeeks[0]?.startDate ?? "",
    reason: "",
  });
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] =
    useState<PendingNavigation | null>(null);
  const [feedback, setFeedback] = useState("");
  const backgroundRef = useRef<HTMLDivElement>(null);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  const shouldRestoreFocusRef = useRef(false);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  const selectedWeek = dummyStaffWeeks[selectedWeekIndex] ?? dummyStaffWeeks[0];
  const weekDays = useMemo(
    () => getWeekDays(selectedWeek.startDate),
    [selectedWeek.startDate],
  );
  const selectedStaff =
    staffMembers.find((staff) => staff.id === selectedStaffId) ??
    staffMembers[0];
  const isDialogOpen = Boolean(dialogMode) || discardConfirmationOpen;
  const hasDirtyChanges = editState === "dirty";

  const visibleStaff = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es");
    return staffMembers.filter(
      (staff) =>
        !normalizedQuery ||
        staff.name.toLocaleLowerCase("es").includes(normalizedQuery),
    );
  }, [query, staffMembers]);

  const weekShifts = useMemo(() => {
    if (!selectedStaff) return [];
    return shifts.filter(
      (shift) =>
        shift.staffId === selectedStaff.id &&
        weekDays.some((day) => day.date === shift.date),
    );
  }, [selectedStaff, shifts, weekDays]);

  const weekAbsences = useMemo(() => {
    if (!selectedStaff) return [];
    return absences.filter(
      (absence) =>
        absence.staffId === selectedStaff.id &&
        weekDays.some((day) => day.date === absence.date),
    );
  }, [absences, selectedStaff, weekDays]);

  useEffect(() => {
    const background = backgroundRef.current;
    if (!background) return;

    if (isDialogOpen) {
      background.setAttribute("aria-hidden", "true");
      background.setAttribute("inert", "");
      return;
    }

    background.removeAttribute("aria-hidden");
    background.removeAttribute("inert");

    if (shouldRestoreFocusRef.current) {
      shouldRestoreFocusRef.current = false;
      focusReturnRef.current?.focus();
      focusReturnRef.current = null;
    }
  }, [isDialogOpen]);

  useEffect(() => {
    if (dialogMode && !discardConfirmationOpen) {
      window.setTimeout(() => firstFieldRef.current?.focus(), 0);
    }
  }, [dialogMode, discardConfirmationOpen]);

  useEffect(() => {
    if (discardConfirmationOpen) {
      window.setTimeout(() => cancelButtonRef.current?.focus(), 0);
    }
  }, [discardConfirmationOpen]);

  useEffect(() => {
    if (!hasDirtyChanges) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasDirtyChanges]);

  useEffect(() => {
    const background = backgroundRef.current;
    return () => {
      background?.removeAttribute("aria-hidden");
      background?.removeAttribute("inert");
    };
  }, []);

  const setFocusOrigin = (origin?: HTMLElement) => {
    focusReturnRef.current =
      origin ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
  };

  const markDirty = () => {
    setEditState("dirty");
    setFeedback("Cambio pendiente en datos simulados.");
  };

  const openDiscardConfirmation = () => {
    setDiscardConfirmationOpen(true);
  };

  const closeDiscardConfirmation = () => {
    setDiscardConfirmationOpen(false);
  };

  const closeDialog = () => {
    if (hasDirtyChanges) {
      openDiscardConfirmation();
      return;
    }

    shouldRestoreFocusRef.current = true;
    setDialogMode(null);
    setFormErrors({});
    setFeedback("");
  };

  const resetDraftState = () => {
    setDialogMode(null);
    setSelectedShiftId("");
    setFormErrors({});
    setEditState("unchanged");
    setDiscardConfirmationOpen(false);
    setFeedback("Cambios descartados.");
  };

  const applyPendingNavigation = (navigation: PendingNavigation) => {
    if (navigation.type === "person") {
      setSelectedStaffId(navigation.staffId);
      return;
    }

    setSelectedWeekIndex(navigation.weekIndex);
  };

  const confirmDiscard = () => {
    const navigation = pendingNavigation;
    setPendingNavigation(null);
    resetDraftState();

    if (navigation) {
      applyPendingNavigation(navigation);
    } else {
      shouldRestoreFocusRef.current = true;
    }
  };

  const requestPersonSelection = (staffId: string, origin?: HTMLElement) => {
    if (staffId === selectedStaff?.id) return;

    setFocusOrigin(origin);
    if (hasDirtyChanges) {
      setPendingNavigation({ staffId, type: "person" });
      openDiscardConfirmation();
      return;
    }

    setSelectedStaffId(staffId);
  };

  const requestWeekSelection = (weekIndex: number, origin?: HTMLElement) => {
    if (weekIndex < 0 || weekIndex >= dummyStaffWeeks.length) return;

    setFocusOrigin(origin);
    if (hasDirtyChanges) {
      setPendingNavigation({ type: "week", weekIndex });
      openDiscardConfirmation();
      return;
    }

    setSelectedWeekIndex(weekIndex);
  };

  const openScheduleForm = (shift: StaffShift, origin?: HTMLElement) => {
    setFocusOrigin(origin);
    setSelectedShiftId(shift.id);
    setShiftDraft({
      date: shift.date,
      endTime: shift.endTime,
      id: shift.id,
      reason: "",
      startTime: shift.startTime,
    });
    setFormErrors({});
    setEditState("unchanged");
    setFeedback("");
    setDialogMode("schedule");
  };

  const openSpecialShiftForm = (
    shift?: StaffShift,
    origin?: HTMLElement,
    date = selectedWeek.startDate,
  ) => {
    setFocusOrigin(origin);
    setSelectedShiftId(shift?.id ?? "");
    setShiftDraft({
      date: shift?.date ?? date,
      endTime: shift?.endTime ?? "",
      id: shift?.id ?? "",
      reason: "",
      startTime: shift?.startTime ?? "",
    });
    setFormErrors({});
    setEditState("unchanged");
    setFeedback("");
    setDialogMode("special");
  };

  const openAbsenceForm = (
    date = selectedWeek.startDate,
    origin?: HTMLElement,
  ) => {
    setFocusOrigin(origin);
    setAbsenceDraft({ date, reason: "" });
    setFormErrors({});
    setEditState("unchanged");
    setFeedback("");
    setDialogMode("absence");
  };

  const saveShift = () => {
    if (!selectedStaff || editState === "saving") return;

    const errors = validateShiftForm(shiftDraft);
    setFormErrors(errors);
    if (hasErrors(errors)) {
      window.setTimeout(() => firstFieldRef.current?.focus(), 0);
      return;
    }

    const operation: StaffAuditEntry["operation"] =
      dialogMode === "special"
        ? selectedShiftId
          ? "special-shift-update"
          : "special-shift-create"
        : "schedule-update";
    const kind: StaffShift["kind"] =
      dialogMode === "special" ? "special" : "regular";
    const nextShift = buildNewShift({
      form: shiftDraft,
      kind,
      staffId: selectedStaff.id,
    });

    setEditState("saving");
    setFeedback("Guardando cambios simulados.");
    window.setTimeout(() => {
      setShifts((current) => {
        const exists = current.some((shift) => shift.id === nextShift.id);
        if (!exists) return [...current, nextShift];
        return current.map((shift) =>
          shift.id === nextShift.id ? nextShift : shift,
        );
      });
      setAuditEntries((current) => [
        buildAuditEntry({
          operation,
          reason: shiftDraft.reason,
          staffId: selectedStaff.id,
        }),
        ...current,
      ]);
      setEditState("unchanged");
      setDialogMode(null);
      setFeedback("Cambios guardados en datos simulados.");
      shouldRestoreFocusRef.current = true;
    }, 120);
  };

  const saveAbsence = () => {
    if (!selectedStaff || editState === "saving") return;

    const errors = validateAbsenceForm(absenceDraft);
    setFormErrors(errors);
    if (hasErrors(errors)) {
      window.setTimeout(() => firstFieldRef.current?.focus(), 0);
      return;
    }

    const nextAbsence: StaffAbsence = {
      date: absenceDraft.date,
      id: `absence-${selectedStaff.id}-${Date.now()}`,
      reason: absenceDraft.reason.trim() || undefined,
      staffId: selectedStaff.id,
    };

    setEditState("saving");
    setFeedback("Guardando cambios simulados.");
    window.setTimeout(() => {
      setAbsences((current) => [...current, nextAbsence]);
      setAuditEntries((current) => [
        buildAuditEntry({
          operation: "absence-create",
          reason: absenceDraft.reason,
          staffId: selectedStaff.id,
        }),
        ...current,
      ]);
      setEditState("unchanged");
      setDialogMode(null);
      setFeedback("Ausencia registrada en datos simulados.");
      shouldRestoreFocusRef.current = true;
    }, 120);
  };

  const updateShiftDraft = (field: keyof ShiftForm, value: string) => {
    setShiftDraft((current) => ({ ...current, [field]: value }));
    setFormErrors((current) => ({ ...current, [field]: undefined }));
    markDirty();
  };

  const updateAbsenceDraft = (field: keyof AbsenceForm, value: string) => {
    setAbsenceDraft((current) => ({ ...current, [field]: value }));
    setFormErrors((current) => ({ ...current, [field]: undefined }));
    markDirty();
  };

  const renderDayContent = (day: WeekDay) => {
    const dayShifts = weekShifts.filter((shift) => shift.date === day.date);
    const dayAbsences = weekAbsences.filter(
      (absence) => absence.date === day.date,
    );

    return (
      <div className={styles.dayContent}>
        <div className={styles.dayHeader}>
          <strong>{day.label}</strong>
          {dayAbsences.length ? (
            <span className={styles.absentLabel}>Ausente</span>
          ) : (
            <span>
              {staffAvailabilityLabels[selectedStaff.availabilityStatus]}
            </span>
          )}
        </div>
        {dayShifts.length ? (
          <ul className={styles.shiftList}>
            {dayShifts.map((shift) => (
              <li key={shift.id}>
                <span>
                  {shift.startTime} - {shift.endTime}
                </span>
                <small>
                  {shift.kind === "special" ? "Turno especial" : "Horario"}
                </small>
                <div className={styles.shiftActions}>
                  <button
                    type="button"
                    onClick={(event) =>
                      shift.kind === "special"
                        ? openSpecialShiftForm(shift, event.currentTarget)
                        : openScheduleForm(shift, event.currentTarget)
                    }
                  >
                    {shift.kind === "special"
                      ? "Editar turno especial"
                      : "Editar horario"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.emptyText}>Sin horarios simulados.</p>
        )}
        {dayAbsences.map((absence) => (
          <p className={styles.absenceNote} key={absence.id}>
            Ausencia simulada{absence.reason ? `: ${absence.reason}` : ""}
          </p>
        ))}
        <div className={styles.dayActions}>
          <button
            type="button"
            onClick={(event) =>
              openSpecialShiftForm(undefined, event.currentTarget, day.date)
            }
          >
            Turno especial
          </button>
          <button
            type="button"
            onClick={(event) => openAbsenceForm(day.date, event.currentTarget)}
          >
            Registrar ausencia
          </button>
        </div>
      </div>
    );
  };

  return (
    <section className={styles.page} aria-labelledby="staff-title">
      <div className={styles.backgroundContent} ref={backgroundRef}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>Administracion</span>
            <h1 id="staff-title">Personal y horarios semanales</h1>
            <p>
              Consulta personal, semanas, horarios, turnos especiales y
              ausencias con datos simulados.
            </p>
          </div>
          <StatusBadge
            label={editStateLabels[editState]}
            tone={editState === "dirty" ? "warning" : "info"}
          />
        </header>

        <div className={styles.notice}>
          <CalendarDays aria-hidden="true" size={19} />
          <span>
            Datos simulados: personal, horarios, ausencias, actor y bitacora no
            estan conectados a backend.
          </span>
        </div>

        <div aria-live="polite" className={styles.feedback} role="status">
          {editState === "saving" ? (
            <>
              <LoaderCircle aria-hidden="true" size={18} />
              <span>Guardando cambios simulados.</span>
            </>
          ) : feedback ? (
            <>
              <Check aria-hidden="true" size={18} />
              <span>{feedback}</span>
            </>
          ) : (
            <span>No hay cambios pendientes.</span>
          )}
        </div>

        <div className={styles.toolbar}>
          <label className={styles.search}>
            <Search aria-hidden="true" size={18} />
            <span>Buscar personal</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <div className={styles.weekControls} aria-label="Seleccion de semana">
            <button
              type="button"
              onClick={(event) =>
                requestWeekSelection(selectedWeekIndex - 1, event.currentTarget)
              }
              disabled={selectedWeekIndex === 0}
            >
              <ChevronLeft aria-hidden="true" size={18} />
              Semana anterior
            </button>
            <strong>{selectedWeek.label}</strong>
            <button
              type="button"
              onClick={(event) =>
                requestWeekSelection(selectedWeekIndex + 1, event.currentTarget)
              }
              disabled={selectedWeekIndex === dummyStaffWeeks.length - 1}
            >
              Semana siguiente
              <ChevronRight aria-hidden="true" size={18} />
            </button>
          </div>
        </div>

        <div className={styles.workspace}>
          <aside className={styles.staffPanel} aria-label="Personal simulado">
            <div className={styles.sectionHeading}>
              <h2>Personal</h2>
              <span>{visibleStaff.length} registros</span>
            </div>
            {visibleStaff.length ? (
              <div className={styles.staffList}>
                {visibleStaff.map((staff) => (
                  <button
                    aria-pressed={selectedStaff?.id === staff.id}
                    key={staff.id}
                    type="button"
                    onClick={(event) =>
                      requestPersonSelection(staff.id, event.currentTarget)
                    }
                  >
                    <strong>{staff.name}</strong>
                    <span>
                      {staffAvailabilityLabels[staff.availabilityStatus]}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className={styles.emptyText}>No hay personal simulado.</p>
            )}
          </aside>

          <div className={styles.schedulePanel}>
            <div className={styles.sectionHeading}>
              <div>
                <h2>{selectedStaff?.name ?? "Sin seleccion"}</h2>
                <span>
                  {selectedStaff
                    ? staffAvailabilityLabels[selectedStaff.availabilityStatus]
                    : "Sin estado"}
                </span>
              </div>
            </div>

            {selectedStaff ? (
              <div className={styles.weekGrid} aria-label="Horario semanal">
                {weekDays.map((day) => (
                  <article className={styles.dayCard} key={day.date}>
                    {renderDayContent(day)}
                  </article>
                ))}
              </div>
            ) : (
              <p className={styles.emptyText}>Selecciona personal simulado.</p>
            )}
          </div>
        </div>

        <section className={styles.auditPanel} aria-label="Bitacora simulada">
          <div className={styles.sectionHeading}>
            <h2>Bitacora simulada</h2>
            <ClipboardList aria-hidden="true" size={18} />
          </div>
          <ul>
            {auditEntries.map((entry) => {
              const staff = staffMembers.find(
                (member) => member.id === entry.staffId,
              );
              return (
                <li key={entry.id}>
                  <strong>{auditOperationLabels[entry.operation]}</strong>
                  <span>{staff?.name ?? "Personal simulado"}</span>
                  <small>
                    {entry.actor} - {entry.performedAt}
                    {entry.reason ? ` - ${entry.reason}` : ""}
                  </small>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {dialogMode ? (
        <div
          aria-labelledby="staff-dialog-title"
          aria-modal="true"
          className={styles.dialogBackdrop}
          role="dialog"
          onKeyDown={(event) => handleDialogKeyDown(event, closeDialog)}
        >
          <form
            className={styles.dialog}
            onSubmit={(event) => {
              event.preventDefault();
              if (dialogMode === "absence") {
                saveAbsence();
                return;
              }
              saveShift();
            }}
            aria-hidden={discardConfirmationOpen ? "true" : undefined}
            inert={discardConfirmationOpen ? true : undefined}
          >
            <div className={styles.dialogHeader}>
              <h2 id="staff-dialog-title">
                {dialogMode === "schedule"
                  ? "Editar horario"
                  : dialogMode === "special"
                    ? selectedShiftId
                      ? "Editar turno especial"
                      : "Registrar turno especial"
                    : "Registrar ausencia"}
              </h2>
              <button
                aria-label="Cerrar formulario"
                type="button"
                onClick={closeDialog}
              >
                <X aria-hidden="true" size={19} />
              </button>
            </div>

            <label className={styles.field}>
              <span>Fecha</span>
              <input
                aria-describedby={
                  formErrors.date ? "staff-date-error" : undefined
                }
                aria-invalid={formErrors.date ? "true" : undefined}
                ref={firstFieldRef}
                type="date"
                value={
                  dialogMode === "absence" ? absenceDraft.date : shiftDraft.date
                }
                onChange={(event) =>
                  dialogMode === "absence"
                    ? updateAbsenceDraft("date", event.target.value)
                    : updateShiftDraft("date", event.target.value)
                }
              />
              {formErrors.date ? (
                <span className={styles.errorText} id="staff-date-error">
                  {formErrors.date}
                </span>
              ) : null}
            </label>

            {dialogMode !== "absence" ? (
              <>
                <label className={styles.field}>
                  <span>Hora de inicio</span>
                  <input
                    aria-describedby={
                      formErrors.startTime ? "staff-start-error" : undefined
                    }
                    aria-invalid={formErrors.startTime ? "true" : undefined}
                    type="time"
                    value={shiftDraft.startTime}
                    onChange={(event) =>
                      updateShiftDraft("startTime", event.target.value)
                    }
                  />
                  {formErrors.startTime ? (
                    <span className={styles.errorText} id="staff-start-error">
                      {formErrors.startTime}
                    </span>
                  ) : null}
                </label>
                <label className={styles.field}>
                  <span>Hora de finalizacion</span>
                  <input
                    aria-describedby={
                      formErrors.endTime ? "staff-end-error" : undefined
                    }
                    aria-invalid={formErrors.endTime ? "true" : undefined}
                    type="time"
                    value={shiftDraft.endTime}
                    onChange={(event) =>
                      updateShiftDraft("endTime", event.target.value)
                    }
                  />
                  {formErrors.endTime ? (
                    <span className={styles.errorText} id="staff-end-error">
                      {formErrors.endTime}
                    </span>
                  ) : null}
                </label>
              </>
            ) : null}

            <label className={styles.field}>
              <span>Motivo opcional simulado</span>
              <input
                type="text"
                value={
                  dialogMode === "absence"
                    ? absenceDraft.reason
                    : shiftDraft.reason
                }
                onChange={(event) =>
                  dialogMode === "absence"
                    ? updateAbsenceDraft("reason", event.target.value)
                    : updateShiftDraft("reason", event.target.value)
                }
              />
            </label>

            <div
              aria-live="polite"
              className={styles.dialogStatus}
              role="status"
            >
              {editState === "saving"
                ? "Guardando cambios simulados."
                : "Formulario con datos simulados."}
            </div>

            <div className={styles.dialogActions}>
              <Button type="button" variant="secondary" onClick={closeDialog}>
                Cancelar
              </Button>
              <Button type="submit" disabled={editState === "saving"}>
                {editState === "saving" ? (
                  <>
                    <LoaderCircle aria-hidden="true" size={17} />
                    Guardando
                  </>
                ) : (
                  "Guardar cambios"
                )}
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {discardConfirmationOpen ? (
        <div
          aria-labelledby="staff-discard-title"
          aria-modal="true"
          className={styles.dialogBackdrop}
          role="dialog"
          onKeyDown={(event) =>
            handleDialogKeyDown(event, closeDiscardConfirmation)
          }
        >
          <div className={styles.dialog}>
            <h2 id="staff-discard-title">Descartar cambios</h2>
            <p>
              Hay cambios pendientes en datos simulados. Puedes conservar el
              borrador o descartarlo.
            </p>
            <div className={styles.dialogActions}>
              <button
                className={styles.secondaryButton}
                ref={cancelButtonRef}
                type="button"
                onClick={closeDiscardConfirmation}
              >
                Cancelar
              </button>
              <Button type="button" onClick={confirmDiscard}>
                Descartar cambios
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
