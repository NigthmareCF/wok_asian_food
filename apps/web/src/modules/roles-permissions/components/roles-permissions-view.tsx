"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  Check,
  CircleAlert,
  ClipboardList,
  LoaderCircle,
  Plus,
  Save,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  dummyAdminPermissions,
  dummyAdminRoles,
  initialRoleAuditEntries,
  type AdminRole,
  type RoleAuditEntry,
  type RolePermissionViewState,
} from "@/data/fixtures/roles-permissions";
import { Button } from "@/shared/components/ui/button";
import { StatusBadge } from "@/shared/components/ui/status-badge";
import styles from "./roles-permissions.module.css";

type RoleFormMode = "create" | "edit";

type RoleDraft = {
  id: string;
  name: string;
  permissionIds: string[];
};

type RoleFormErrors = {
  name?: string;
};

const viewStateLabels: Record<RolePermissionViewState, string> = {
  conflict: "Conflicto",
  dirty: "Cambios pendientes",
  saving: "Guardando",
  unchanged: "Sin cambios",
};

const auditOperationLabels: Record<RoleAuditEntry["operation"], string> = {
  create: "Creación",
  update: "Actualización",
};

const groupedPermissions = dummyAdminPermissions.reduce<
  Record<string, typeof dummyAdminPermissions>
>((groups, permission) => {
  return {
    ...groups,
    [permission.group]: [...(groups[permission.group] ?? []), permission],
  };
}, {});

const emptyDraft: RoleDraft = {
  id: "",
  name: "",
  permissionIds: [],
};

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
  roleId,
}: {
  operation: RoleAuditEntry["operation"];
  roleId: string;
}): RoleAuditEntry {
  return {
    actor: "Administración demo",
    id: `RAUD-${Date.now()}`,
    operation,
    performedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    roleId,
  };
}

function sortPermissionIds(permissionIds: string[]) {
  return [...permissionIds].sort((left, right) => left.localeCompare(right));
}

function hasDraftChanges(draft: RoleDraft, role?: AdminRole) {
  if (!role) {
    return Boolean(draft.name.trim() || draft.permissionIds.length);
  }

  return (
    draft.name.trim() !== role.name ||
    sortPermissionIds(draft.permissionIds).join("|") !==
      sortPermissionIds(role.permissionIds).join("|")
  );
}

export function RolesPermissionsView() {
  const [roles, setRoles] = useState<AdminRole[]>(dummyAdminRoles);
  const [auditEntries, setAuditEntries] = useState<RoleAuditEntry[]>(
    initialRoleAuditEntries,
  );
  const [query, setQuery] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState(dummyAdminRoles[0]?.id);
  const [viewState, setViewState] =
    useState<RolePermissionViewState>("unchanged");
  const [feedback, setFeedback] = useState("");
  const [formMode, setFormMode] = useState<RoleFormMode | null>(null);
  const [draft, setDraft] = useState<RoleDraft>(emptyDraft);
  const [formErrors, setFormErrors] = useState<RoleFormErrors>({});
  const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);
  const backgroundRef = useRef<HTMLDivElement>(null);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  const shouldRestoreFocusRef = useRef(false);

  const selectedRole =
    roles.find((role) => role.id === selectedRoleId) ?? roles[0];
  const draftSourceRole =
    formMode === "edit"
      ? roles.find((role) => role.id === draft.id)
      : undefined;
  const isDialogOpen = Boolean(formMode) || discardConfirmationOpen;

  const visibleRoles = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es");
    return roles.filter(
      (role) =>
        !normalizedQuery ||
        role.name.toLocaleLowerCase("es").includes(normalizedQuery),
    );
  }, [query, roles]);

  const effectivePermissions = useMemo(() => {
    if (!selectedRole) return [];
    return dummyAdminPermissions.filter((permission) =>
      selectedRole.permissionIds.includes(permission.id),
    );
  }, [selectedRole]);

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
    if (viewState !== "dirty") return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [viewState]);

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

  const openCreateForm = (origin?: HTMLElement) => {
    setFocusOrigin(origin);
    setDraft(emptyDraft);
    setFormErrors({});
    setFormMode("create");
    setViewState("unchanged");
    setFeedback("");
  };

  const openEditForm = (role: AdminRole, origin?: HTMLElement) => {
    setFocusOrigin(origin);
    setDraft({
      id: role.id,
      name: role.name,
      permissionIds: role.permissionIds,
    });
    setFormErrors({});
    setFormMode("edit");
    setViewState("unchanged");
    setFeedback("");
  };

  const closeForm = () => {
    shouldRestoreFocusRef.current = true;
    setFormMode(null);
    setDraft(emptyDraft);
    setFormErrors({});
    setDiscardConfirmationOpen(false);
    setViewState("unchanged");
  };

  const updateDraft = (nextDraft: RoleDraft) => {
    setDraft(nextDraft);
    setFormErrors((current) => ({
      name: nextDraft.name.trim() ? undefined : current.name,
    }));
    setViewState(
      hasDraftChanges(nextDraft, draftSourceRole) ? "dirty" : "unchanged",
    );
    setFeedback("");
  };

  const togglePermission = (permissionId: string, checked: boolean) => {
    const nextPermissionIds = checked
      ? [...draft.permissionIds, permissionId]
      : draft.permissionIds.filter((id) => id !== permissionId);
    updateDraft({ ...draft, permissionIds: nextPermissionIds });
  };

  const saveDraft = () => {
    const trimmedName = draft.name.trim();
    if (viewState === "saving") return;

    if (!trimmedName) {
      setFormErrors({ name: "El nombre del rol es requerido." });
      window.setTimeout(() => {
        document.getElementById("admin-role-name")?.focus();
      }, 0);
      return;
    }

    setViewState("saving");
    window.setTimeout(() => {
      if (formMode === "create") {
        const nextRole: AdminRole = {
          id: `role-demo-${Date.now()}`,
          name: trimmedName,
          permissionIds: draft.permissionIds,
        };
        setRoles((current) => [nextRole, ...current]);
        setSelectedRoleId(nextRole.id);
        setAuditEntries((current) => [
          buildAuditEntry({ operation: "create", roleId: nextRole.id }),
          ...current,
        ]);
        setFeedback("Rol creado con datos simulados.");
      }

      if (formMode === "edit") {
        setRoles((current) =>
          current.map((role) =>
            role.id === draft.id
              ? {
                  ...role,
                  name: trimmedName,
                  permissionIds: draft.permissionIds,
                }
              : role,
          ),
        );
        setSelectedRoleId(draft.id);
        setAuditEntries((current) => [
          buildAuditEntry({ operation: "update", roleId: draft.id }),
          ...current,
        ]);
        setFeedback("Rol actualizado con datos simulados.");
      }

      closeForm();
    }, 250);
  };

  const openDiscardConfirmation = () => {
    setDiscardConfirmationOpen(true);
  };

  const requestCloseForm = () => {
    if (viewState === "dirty") {
      openDiscardConfirmation();
      return;
    }

    closeForm();
  };

  const closeDiscardConfirmation = () => {
    setDiscardConfirmationOpen(false);
    window.setTimeout(() => {
      document.getElementById("role-discard-open")?.focus();
    }, 0);
  };

  const discardChanges = () => {
    closeForm();
  };

  return (
    <div className={styles.page}>
      <div ref={backgroundRef} className={styles.backgroundContent}>
        <header className={styles.header}>
          <div>
            <span className="ops-kicker">Canal administrativo</span>
            <h1>Roles y permisos</h1>
            <p>
              Crea roles, marca permisos y consulta permisos efectivos
              simulados.
            </p>
          </div>
          <div className={styles.headerActions}>
            <StatusBadge label="DATOS SIMULADOS" tone="info" />
            <Button
              onClick={(event) => openCreateForm(event.currentTarget)}
              type="button"
            >
              <Plus aria-hidden="true" size={18} /> Crear rol
            </Button>
          </div>
        </header>

        <section className={styles.notice}>
          <ShieldCheck aria-hidden="true" size={19} />
          <span>
            Roles, permisos, actor y bitácora son datos simulados. El catálogo
            real debe confirmarse con backend.
          </span>
        </section>

        {feedback ? (
          <div className={styles.feedback} role="status">
            <Check aria-hidden="true" size={18} /> {feedback}
          </div>
        ) : null}

        {viewState === "conflict" ? (
          <div className={styles.conflict} role="alert">
            <CircleAlert aria-hidden="true" size={20} />
            <span>
              Conflicto simulado. Esta vista no resuelve conflictos reales.
            </span>
          </div>
        ) : null}

        <section className={styles.toolbar} aria-label="Controles de roles">
          <label className={styles.search}>
            <Search aria-hidden="true" size={18} />
            <span className="sr-only">Buscar rol</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar rol"
              type="search"
              value={query}
            />
          </label>
          <div className={styles.stateControls}>
            <span>Estado de cambios</span>
            <div aria-label="Estado de la vista" className={styles.segmented}>
              {(Object.keys(viewStateLabels) as RolePermissionViewState[]).map(
                (state) => (
                  <button
                    aria-pressed={viewState === state}
                    disabled={
                      state === "saving" ||
                      (state === "dirty" && viewState !== "dirty")
                    }
                    key={state}
                    onClick={() => {
                      if (state === "conflict") {
                        setViewState("conflict");
                      }
                      if (state === "unchanged") {
                        setViewState("unchanged");
                      }
                    }}
                    type="button"
                  >
                    {viewStateLabels[state]}
                  </button>
                ),
              )}
            </div>
          </div>
        </section>

        <section className={styles.workspace}>
          <aside className={styles.listPanel} aria-label="Roles simulados">
            <header className={styles.sectionHeading}>
              <div>
                <h2>Roles</h2>
                <span>{visibleRoles.length} roles simulados</span>
              </div>
            </header>
            <div className={styles.roleList}>
              {visibleRoles.length ? (
                visibleRoles.map((role) => (
                  <button
                    aria-pressed={selectedRole?.id === role.id}
                    key={role.id}
                    onClick={() => setSelectedRoleId(role.id)}
                    type="button"
                  >
                    <strong>{role.name}</strong>
                    <span>{role.permissionIds.length} permisos guardados</span>
                  </button>
                ))
              ) : (
                <div className={styles.emptyState}>
                  <ClipboardList aria-hidden="true" size={24} />
                  <strong>No encontramos roles</strong>
                  <span>Prueba otra búsqueda.</span>
                </div>
              )}
            </div>
          </aside>

          <main className={styles.detailPanel} aria-label="Detalle de rol">
            {selectedRole ? (
              <>
                <header className={styles.detailHeader}>
                  <div>
                    <span>Rol seleccionado</span>
                    <h2>{selectedRole.name}</h2>
                    <p>
                      Los permisos efectivos muestran únicamente lo guardado.
                    </p>
                  </div>
                  <Button
                    onClick={(event) =>
                      openEditForm(selectedRole, event.currentTarget)
                    }
                    type="button"
                    variant="secondary"
                  >
                    Editar rol
                  </Button>
                </header>

                <section
                  className={styles.permissionsPanel}
                  aria-label="Permisos efectivos"
                >
                  <h3>Permisos efectivos guardados</h3>
                  {effectivePermissions.length ? (
                    <ul>
                      {effectivePermissions.map((permission) => (
                        <li key={permission.id}>
                          <strong>{permission.label}</strong>
                          <span>{permission.group}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>Este rol no tiene permisos guardados.</p>
                  )}
                </section>
              </>
            ) : (
              <div className={styles.emptyState}>
                <ClipboardList aria-hidden="true" size={24} />
                <strong>Selecciona un rol</strong>
              </div>
            )}
          </main>
        </section>

        <section className={styles.auditPanel} aria-label="Bitácora simulada">
          <header className={styles.sectionHeading}>
            <div>
              <h2>Registro simulado</h2>
              <span>Actor, fecha, operación y motivo opcional.</span>
            </div>
          </header>
          <ul>
            {auditEntries.slice(0, 5).map((entry) => (
              <li key={entry.id}>
                <strong>{auditOperationLabels[entry.operation]}</strong>
                <span>
                  {entry.actor} · {entry.performedAt}
                </span>
                <small>
                  Rol {entry.roleId}
                  {entry.reason ? ` · Motivo: ${entry.reason}` : ""}
                </small>
              </li>
            ))}
          </ul>
        </section>

        <p className={styles.disclaimer}>
          Datos dummy para validar la experiencia. Los roles y permisos no son
          un catálogo definitivo. Los permisos del frontend son únicamente
          visuales y no autorizan acciones reales.
        </p>
      </div>

      {formMode ? (
        <RoleFormDialog
          draft={draft}
          errors={formErrors}
          inert={discardConfirmationOpen}
          mode={formMode}
          onClose={requestCloseForm}
          onDiscard={openDiscardConfirmation}
          onSave={saveDraft}
          onTogglePermission={togglePermission}
          onUpdate={updateDraft}
          viewState={viewState}
        />
      ) : null}

      {discardConfirmationOpen ? (
        <DiscardConfirmationDialog
          onCancel={closeDiscardConfirmation}
          onConfirm={discardChanges}
        />
      ) : null}
    </div>
  );
}

function RoleFormDialog({
  draft,
  errors,
  inert,
  mode,
  onClose,
  onDiscard,
  onSave,
  onTogglePermission,
  onUpdate,
  viewState,
}: {
  draft: RoleDraft;
  errors: RoleFormErrors;
  inert: boolean;
  mode: RoleFormMode;
  onClose: () => void;
  onDiscard: () => void;
  onSave: () => void;
  onTogglePermission: (permissionId: string, checked: boolean) => void;
  onUpdate: (draft: RoleDraft) => void;
  viewState: RolePermissionViewState;
}) {
  const title = mode === "create" ? "Crear rol" : "Editar rol";
  const hasChanges = viewState === "dirty";

  useEffect(() => {
    document.getElementById("admin-role-name")?.focus();
  }, []);

  return (
    <div className={styles.dialogBackdrop} role="presentation">
      <section
        aria-hidden={inert ? "true" : undefined}
        aria-labelledby="role-form-title"
        aria-modal="true"
        className={styles.roleDialog}
        inert={inert ? true : undefined}
        onKeyDown={(event) => handleDialogKeyDown(event, onClose)}
        role="dialog"
      >
        <button
          aria-label="Cerrar formulario"
          className={styles.iconButton}
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" size={19} />
        </button>
        <header>
          <span>Datos simulados</span>
          <h2 id="role-form-title">{title}</h2>
          <p>Marca permisos visuales. La autorización real depende backend.</p>
        </header>

        <div className={styles.field}>
          <label htmlFor="admin-role-name">Nombre del rol</label>
          <input
            aria-describedby={errors.name ? "admin-role-name-error" : undefined}
            aria-invalid={Boolean(errors.name)}
            id="admin-role-name"
            onChange={(event) =>
              onUpdate({ ...draft, name: event.target.value })
            }
            type="text"
            value={draft.name}
          />
          {errors.name ? (
            <span className={styles.fieldError} id="admin-role-name-error">
              {errors.name}
            </span>
          ) : null}
        </div>

        <section
          className={styles.permissionMatrix}
          aria-label="Permisos disponibles"
        >
          {Object.entries(groupedPermissions).map(([group, permissions]) => (
            <fieldset key={group}>
              <legend>{group}</legend>
              {permissions.map((permission) => (
                <label key={permission.id}>
                  <input
                    checked={draft.permissionIds.includes(permission.id)}
                    onChange={(event) =>
                      onTogglePermission(permission.id, event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>{permission.label}</span>
                </label>
              ))}
            </fieldset>
          ))}
        </section>

        <div className={styles.dialogState} aria-live="polite">
          {viewState === "saving" ? (
            <>
              <LoaderCircle aria-hidden="true" size={18} /> Guardando cambios
              simulados.
            </>
          ) : (
            <>
              {viewStateLabels[viewState]}
              {viewState === "unchanged" ? " · No hay cambios pendientes." : ""}
            </>
          )}
        </div>

        <div className={styles.dialogActions}>
          <Button
            id={hasChanges ? "role-discard-open" : undefined}
            onClick={hasChanges ? onDiscard : onClose}
            type="button"
            variant="secondary"
          >
            {hasChanges ? "Descartar cambios" : "Cancelar"}
          </Button>
          <Button
            disabled={viewState === "saving"}
            onClick={onSave}
            type="button"
          >
            <Save aria-hidden="true" size={17} /> Guardar cambios
          </Button>
        </div>
      </section>
    </div>
  );
}

function DiscardConfirmationDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    document.getElementById("role-discard-cancel")?.focus();
  }, []);

  return (
    <div className={styles.confirmBackdrop} role="presentation">
      <section
        aria-labelledby="role-discard-title"
        aria-modal="true"
        className={styles.confirmDialog}
        onKeyDown={(event) => handleDialogKeyDown(event, onCancel)}
        role="dialog"
      >
        <span className={styles.confirmIcon}>
          <CircleAlert aria-hidden="true" size={22} />
        </span>
        <h2 id="role-discard-title">Descartar cambios</h2>
        <p>Los cambios pendientes del rol simulado no se guardarán.</p>
        <div className={styles.dialogActions}>
          <Button
            id="role-discard-cancel"
            onClick={onCancel}
            type="button"
            variant="secondary"
          >
            Cancelar
          </Button>
          <Button onClick={onConfirm} type="button">
            Descartar cambios
          </Button>
        </div>
      </section>
    </div>
  );
}
