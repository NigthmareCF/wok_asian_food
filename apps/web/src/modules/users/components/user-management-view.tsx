"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  AlertTriangle,
  Check,
  CircleAlert,
  ClipboardList,
  LoaderCircle,
  Plus,
  Search,
  ShieldCheck,
  UserCog,
  X,
} from "lucide-react";
import {
  dummyAdminRoles,
  dummyAdminUsers,
  initialUserAuditEntries,
  userStatusLabels,
  type AdminUser,
  type AdminUserRole,
  type UserAuditEntry,
  type UserStatus,
} from "@/data/fixtures/users";
import { Button } from "@/shared/components/ui/button";
import { FormField } from "@/shared/components/ui/form-field";
import { StatusBadge } from "@/shared/components/ui/status-badge";
import styles from "./user-management.module.css";

type StatusFilter = "all" | UserStatus;
type ViewState = "normal" | "loading" | "empty" | "error";
type FormMode = "create" | "edit";
type UserOperation = "activate" | "suspend";

type UserFormState = {
  email: string;
  name: string;
  roleIds: string[];
};

type UserFormErrors = {
  email?: string;
  name?: string;
};

const statusOrder: UserStatus[] = [
  "active",
  "suspended",
  "disabled",
  "pending",
];

const viewStateLabels: Record<ViewState, string> = {
  empty: "Vacío",
  error: "Error",
  loading: "Carga",
  normal: "Normal",
};

const auditOperationLabels: Record<UserAuditEntry["operation"], string> = {
  activate: "Activación",
  create: "Creación",
  edit: "Edición",
  suspend: "Suspensión",
};

const emptyForm: UserFormState = {
  email: "",
  name: "",
  roleIds: [dummyAdminRoles[0]?.id ?? ""].filter(Boolean),
};

function getEffectiveCapabilities(roles: AdminUserRole[]) {
  return Array.from(new Set(roles.flatMap((role) => role.capabilities)));
}

function getStatusClass(status: UserStatus) {
  return `${styles.statusBadge} ${styles[`status_${status}`]}`;
}

function buildAuditEntry({
  operation,
  reason,
  userId,
}: {
  operation: UserAuditEntry["operation"];
  reason?: string;
  userId: string;
}): UserAuditEntry {
  return {
    actor: "Administración demo",
    id: `AUD-${Date.now()}`,
    operation,
    performedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    reason: reason?.trim() || undefined,
    userId,
  };
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

function validateUserForm(formState: UserFormState): UserFormErrors {
  return {
    email: formState.email.trim() ? undefined : "El correo es requerido.",
    name: formState.name.trim() ? undefined : "El nombre es requerido.",
  };
}

export function UserManagementView({
  initialState = "normal",
}: {
  initialState?: ViewState;
}) {
  const [users, setUsers] = useState<AdminUser[]>(dummyAdminUsers);
  const [auditEntries, setAuditEntries] = useState<UserAuditEntry[]>(
    initialUserAuditEntries,
  );
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [viewState, setViewState] = useState<ViewState>(initialState);
  const [expandedUserId, setExpandedUserId] = useState(users[0]?.id ?? "");
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [editingUserId, setEditingUserId] = useState("");
  const [formState, setFormState] = useState<UserFormState>(emptyForm);
  const [formErrors, setFormErrors] = useState<UserFormErrors>({});
  const [pendingOperation, setPendingOperation] = useState<{
    operation: UserOperation;
    userId: string;
  } | null>(null);
  const [operationReason, setOperationReason] = useState("");
  const [feedback, setFeedback] = useState("");
  const backgroundRef = useRef<HTMLDivElement>(null);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  const shouldRestoreFocusRef = useRef(false);

  const isDialogOpen = Boolean(formMode) || Boolean(pendingOperation);

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

  const visibleUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es");
    const baseUsers =
      viewState === "empty"
        ? []
        : users.filter((user) => {
            const matchesStatus =
              statusFilter === "all" || user.status === statusFilter;
            const matchesQuery =
              !normalizedQuery ||
              user.name.toLocaleLowerCase("es").includes(normalizedQuery) ||
              user.email.toLocaleLowerCase("es").includes(normalizedQuery);
            return matchesStatus && matchesQuery;
          });
    return baseUsers;
  }, [query, statusFilter, users, viewState]);

  const selectedUser =
    visibleUsers.find((user) => user.id === expandedUserId) ?? visibleUsers[0];
  const selectedCapabilities = selectedUser
    ? getEffectiveCapabilities(selectedUser.roles)
    : [];

  const setFocusOrigin = (origin?: HTMLElement) => {
    focusReturnRef.current =
      origin ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
  };

  const openCreateForm = (origin?: HTMLElement) => {
    setFocusOrigin(origin);
    setFormMode("create");
    setEditingUserId("");
    setFormState(emptyForm);
    setFormErrors({});
    setFeedback("");
  };

  const openEditForm = (user: AdminUser, origin?: HTMLElement) => {
    setFocusOrigin(origin);
    setFormMode("edit");
    setEditingUserId(user.id);
    setFormState({
      email: user.email,
      name: user.name,
      roleIds: user.roles.map((role) => role.id),
    });
    setFormErrors({});
    setFeedback("");
  };

  const closeForm = () => {
    shouldRestoreFocusRef.current = true;
    setFormMode(null);
    setEditingUserId("");
    setFormState(emptyForm);
    setFormErrors({});
  };

  const openOperationConfirmation = (
    operation: UserOperation,
    userId: string,
    origin?: HTMLElement,
  ) => {
    setFocusOrigin(origin);
    setPendingOperation({ operation, userId });
    setOperationReason("");
  };

  const closeOperationConfirmation = () => {
    shouldRestoreFocusRef.current = true;
    setPendingOperation(null);
    setOperationReason("");
  };

  const updateRoleSelection = (roleId: string, checked: boolean) => {
    setFormState((current) => {
      const roleIds = checked
        ? [...current.roleIds, roleId]
        : current.roleIds.filter((id) => id !== roleId);
      return { ...current, roleIds };
    });
  };

  const updateFormState = (nextState: UserFormState) => {
    setFormState(nextState);
    setFormErrors((current) => ({
      email: nextState.email.trim() ? undefined : current.email,
      name: nextState.name.trim() ? undefined : current.name,
    }));
  };

  const saveUser = () => {
    const nextErrors = validateUserForm(formState);
    const firstInvalidField = nextErrors.name
      ? "admin-user-name"
      : nextErrors.email
        ? "admin-user-email"
        : "";

    if (firstInvalidField) {
      setFormErrors(nextErrors);
      const focusInvalidField = () => {
        document.getElementById(firstInvalidField)?.focus();
      };
      if (window.requestAnimationFrame) {
        window.requestAnimationFrame(focusInvalidField);
      } else {
        window.setTimeout(focusInvalidField, 0);
      }
      return;
    }

    const selectedRoles = dummyAdminRoles.filter((role) =>
      formState.roleIds.includes(role.id),
    );

    if (formMode === "create") {
      const nextUser: AdminUser = {
        email: formState.email.trim(),
        id: `USR-${users.length + 101}`,
        name: formState.name.trim(),
        roles: selectedRoles,
        status: "pending",
      };
      setUsers((current) => [nextUser, ...current]);
      setExpandedUserId(nextUser.id);
      setAuditEntries((current) => [
        buildAuditEntry({ operation: "create", userId: nextUser.id }),
        ...current,
      ]);
      setFeedback("Usuario creado con datos simulados.");
    }

    if (formMode === "edit") {
      setUsers((current) =>
        current.map((user) =>
          user.id === editingUserId
            ? {
                ...user,
                email: formState.email.trim(),
                name: formState.name.trim(),
                roles: selectedRoles,
              }
            : user,
        ),
      );
      setAuditEntries((current) => [
        buildAuditEntry({ operation: "edit", userId: editingUserId }),
        ...current,
      ]);
      setFeedback("Usuario actualizado con datos simulados.");
    }

    closeForm();
  };

  const confirmOperation = () => {
    if (!pendingOperation) return;
    const nextStatus: UserStatus =
      pendingOperation.operation === "activate" ? "active" : "suspended";
    setUsers((current) =>
      current.map((user) =>
        user.id === pendingOperation.userId
          ? { ...user, status: nextStatus }
          : user,
      ),
    );
    setAuditEntries((current) => [
      buildAuditEntry({
        operation: pendingOperation.operation,
        reason: operationReason,
        userId: pendingOperation.userId,
      }),
      ...current,
    ]);
    setFeedback(
      pendingOperation.operation === "activate"
        ? "Usuario activado con datos simulados."
        : "Usuario suspendido con datos simulados.",
    );
    closeOperationConfirmation();
  };

  const pendingUser = pendingOperation
    ? users.find((user) => user.id === pendingOperation.userId)
    : undefined;

  return (
    <div className={styles.page}>
      <div ref={backgroundRef} className={styles.backgroundContent}>
        <header className={styles.header}>
          <div>
            <span className="ops-kicker">Canal administrativo</span>
            <h1>Gestión de usuarios</h1>
            <p>Busca usuarios, consulta roles y registra cambios simulados.</p>
          </div>
          <div className={styles.headerActions}>
            <StatusBadge label="DATOS SIMULADOS" tone="info" />
            <Button
              onClick={(event) => openCreateForm(event.currentTarget)}
              type="button"
            >
              <Plus aria-hidden="true" size={18} /> Crear usuario
            </Button>
          </div>
        </header>

        <section className={styles.notice}>
          <ShieldCheck aria-hidden="true" size={19} />
          <span>
            Los permisos mostrados son únicamente visuales; no representan
            autorización real del backend.
          </span>
        </section>

        {feedback ? (
          <div className={styles.feedback} role="status">
            <Check aria-hidden="true" size={18} /> {feedback}
          </div>
        ) : null}

        <section className={styles.toolbar} aria-label="Controles de usuarios">
          <label className={styles.search}>
            <Search aria-hidden="true" size={18} />
            <span className="sr-only">Buscar usuario por nombre o correo</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nombre o correo"
              type="search"
              value={query}
            />
          </label>
          <div className={styles.controlGroup}>
            <span>Estado</span>
            <div className={styles.segmented} aria-label="Filtrar por estado">
              <button
                aria-pressed={statusFilter === "all"}
                onClick={() => setStatusFilter("all")}
                type="button"
              >
                Todos
              </button>
              {statusOrder.map((status) => (
                <button
                  aria-pressed={statusFilter === status}
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  type="button"
                >
                  {userStatusLabels[status]}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.controlGroup}>
            <span>Estado simulado</span>
            <div
              className={styles.segmented}
              aria-label="Seleccionar estado de vista"
            >
              {(Object.keys(viewStateLabels) as ViewState[]).map((state) => (
                <button
                  aria-pressed={viewState === state}
                  key={state}
                  onClick={() => setViewState(state)}
                  type="button"
                >
                  {viewStateLabels[state]}
                </button>
              ))}
            </div>
          </div>
        </section>

        {viewState === "loading" ? <LoadingState /> : null}
        {viewState === "error" ? <ErrorState /> : null}

        {viewState === "normal" || viewState === "empty" ? (
          <section
            className={styles.workspace}
            aria-label="Usuarios administrativos"
          >
            <div className={styles.listPanel}>
              <header className={styles.sectionHeading}>
                <div>
                  <h2>Usuarios</h2>
                  <span>
                    {visibleUsers.length} resultados con datos simulados
                  </span>
                </div>
              </header>

              {visibleUsers.length ? (
                <>
                  <UserTable
                    expandedUserId={expandedUserId}
                    onActivate={(userId, origin) =>
                      openOperationConfirmation("activate", userId, origin)
                    }
                    onEdit={openEditForm}
                    onSelect={setExpandedUserId}
                    onSuspend={(userId, origin) =>
                      openOperationConfirmation("suspend", userId, origin)
                    }
                    users={visibleUsers}
                  />
                </>
              ) : (
                <EmptyState />
              )}
            </div>

            <aside
              className={styles.detailPanel}
              id="admin-user-role-detail"
              aria-label="Detalle de roles"
            >
              {selectedUser ? (
                <>
                  <header>
                    <span>Roles asignados</span>
                    <h2>{selectedUser.name}</h2>
                    <p>{selectedUser.email}</p>
                  </header>
                  <div className={styles.roleList}>
                    {selectedUser.roles.map((role) => (
                      <article key={role.id}>
                        <strong>{role.name}</strong>
                        <span>{role.capabilities.length} capacidades demo</span>
                      </article>
                    ))}
                  </div>
                  <section
                    className={styles.capabilities}
                    aria-label="Capacidades efectivas"
                  >
                    <h3>Unión visual de capacidades</h3>
                    <ul>
                      {selectedCapabilities.map((capability) => (
                        <li key={capability}>{capability}</li>
                      ))}
                    </ul>
                  </section>
                </>
              ) : (
                <div className={styles.detailEmpty}>
                  <ClipboardList aria-hidden="true" size={22} />
                  <strong>Selecciona un usuario</strong>
                </div>
              )}
            </aside>
          </section>
        ) : null}

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
                  Usuario {entry.userId}
                  {entry.reason ? ` · Motivo: ${entry.reason}` : ""}
                </small>
              </li>
            ))}
          </ul>
        </section>

        <p className={styles.disclaimer}>
          Datos dummy para validar la experiencia. Los roles y capacidades no
          son un catálogo definitivo. El registro público queda pendiente de
          integración y nunca debe asignar roles operativos desde frontend.
        </p>
      </div>

      {formMode ? (
        <UserFormPanel
          errors={formErrors}
          formMode={formMode}
          formState={formState}
          onClose={closeForm}
          onRoleChange={updateRoleSelection}
          onSave={saveUser}
          onUpdate={updateFormState}
        />
      ) : null}

      {pendingOperation && pendingUser ? (
        <ConfirmationDialog
          onCancel={closeOperationConfirmation}
          onConfirm={confirmOperation}
          onReasonChange={setOperationReason}
          operation={pendingOperation.operation}
          reason={operationReason}
          user={pendingUser}
        />
      ) : null}
    </div>
  );
}

function UserTable({
  expandedUserId,
  onActivate,
  onEdit,
  onSelect,
  onSuspend,
  users,
}: {
  expandedUserId: string;
  onActivate: (userId: string, origin: HTMLElement) => void;
  onEdit: (user: AdminUser, origin: HTMLElement) => void;
  onSelect: (userId: string) => void;
  onSuspend: (userId: string, origin: HTMLElement) => void;
  users: AdminUser[];
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Estado</th>
            <th>Roles</th>
            <th>Capacidades</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td data-label="Usuario">
                <button
                  aria-expanded={expandedUserId === user.id}
                  aria-controls="admin-user-role-detail"
                  className={styles.identityButton}
                  onClick={() => onSelect(user.id)}
                  type="button"
                >
                  <strong>{user.name}</strong>
                  <span>{user.email}</span>
                </button>
              </td>
              <td data-label="Estado">
                <span className={getStatusClass(user.status)}>
                  {userStatusLabels[user.status]}
                </span>
              </td>
              <td data-label="Roles">
                {user.roles.map((role) => role.name).join(", ")}
              </td>
              <td data-label="Capacidades">
                {getEffectiveCapabilities(user.roles).length}
              </td>
              <td data-label="Acciones">
                <UserActions
                  onActivate={(origin) => onActivate(user.id, origin)}
                  onEdit={(origin) => onEdit(user, origin)}
                  onSuspend={(origin) => onSuspend(user.id, origin)}
                  status={user.status}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserActions({
  onActivate,
  onEdit,
  onSuspend,
  status,
}: {
  onActivate: (origin: HTMLElement) => void;
  onEdit: (origin: HTMLElement) => void;
  onSuspend: (origin: HTMLElement) => void;
  status: UserStatus;
}) {
  return (
    <div className={styles.actions}>
      <button onClick={(event) => onEdit(event.currentTarget)} type="button">
        Editar
      </button>
      <button
        disabled={status === "active"}
        onClick={(event) => onActivate(event.currentTarget)}
        type="button"
      >
        Activar
      </button>
      <button
        disabled={status === "suspended"}
        onClick={(event) => onSuspend(event.currentTarget)}
        type="button"
      >
        Suspender
      </button>
    </div>
  );
}

function UserFormPanel({
  errors,
  formMode,
  formState,
  onClose,
  onRoleChange,
  onSave,
  onUpdate,
}: {
  errors: UserFormErrors;
  formMode: FormMode;
  formState: UserFormState;
  onClose: () => void;
  onRoleChange: (roleId: string, checked: boolean) => void;
  onSave: () => void;
  onUpdate: (state: UserFormState) => void;
}) {
  useEffect(() => {
    document.getElementById("admin-user-name")?.focus();
  }, []);

  return (
    <div className={styles.panelBackdrop} role="presentation">
      <section
        aria-labelledby="user-form-title"
        aria-modal="true"
        className={styles.sidePanel}
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
          <h2 id="user-form-title">
            {formMode === "create" ? "Crear usuario" : "Editar usuario"}
          </h2>
          <p>
            El estado no se edita desde este formulario. Las acciones
            disponibles son activar o suspender.
          </p>
        </header>
        <div className={styles.formGrid}>
          <FormField
            aria-invalid={Boolean(errors.name)}
            help={errors.name}
            id="admin-user-name"
            label="Nombre"
            onChange={(event) =>
              onUpdate({ ...formState, name: event.target.value })
            }
            value={formState.name}
          />
          <FormField
            aria-invalid={Boolean(errors.email)}
            help={errors.email}
            id="admin-user-email"
            label="Correo"
            onChange={(event) =>
              onUpdate({ ...formState, email: event.target.value })
            }
            type="email"
            value={formState.email}
          />
        </div>
        <fieldset className={styles.roleFieldset}>
          <legend>Roles asignados</legend>
          {dummyAdminRoles.map((role) => (
            <label key={role.id}>
              <input
                checked={formState.roleIds.includes(role.id)}
                onChange={(event) =>
                  onRoleChange(role.id, event.target.checked)
                }
                type="checkbox"
              />
              <span>
                <strong>{role.name}</strong>
                <small>{role.capabilities.join(", ")}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <div className={styles.panelActions}>
          <Button onClick={onClose} type="button" variant="secondary">
            Cancelar
          </Button>
          <Button onClick={onSave} type="button">
            Guardar
          </Button>
        </div>
      </section>
    </div>
  );
}

function ConfirmationDialog({
  onCancel,
  onConfirm,
  onReasonChange,
  operation,
  reason,
  user,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  onReasonChange: (reason: string) => void;
  operation: UserOperation;
  reason: string;
  user: AdminUser;
}) {
  const title =
    operation === "activate" ? "Activar usuario" : "Suspender usuario";
  const confirmLabel =
    operation === "activate" ? "Confirmar activación" : "Confirmar suspensión";

  useEffect(() => {
    document.getElementById("user-confirm-cancel")?.focus();
  }, []);

  return (
    <div className={styles.panelBackdrop} role="presentation">
      <section
        aria-labelledby="user-confirm-title"
        aria-modal="true"
        className={styles.confirmDialog}
        onKeyDown={(event) => handleDialogKeyDown(event, onCancel)}
        role="dialog"
      >
        <button
          aria-label="Cerrar confirmación"
          className={styles.iconButton}
          onClick={onCancel}
          type="button"
        >
          <X aria-hidden="true" size={19} />
        </button>
        <span className={styles.confirmIcon}>
          <CircleAlert aria-hidden="true" size={22} />
        </span>
        <h2 id="user-confirm-title">{title}</h2>
        <p>
          Esta acción actualizará el estado de {user.name} con datos simulados.
        </p>
        <label className={styles.reasonField}>
          <span>Motivo opcional</span>
          <textarea
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Motivo simulado"
            rows={3}
            value={reason}
          />
        </label>
        <div className={styles.panelActions}>
          <Button
            id="user-confirm-cancel"
            onClick={onCancel}
            type="button"
            variant="secondary"
          >
            Cancelar
          </Button>
          <Button onClick={onConfirm} type="button">
            {confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}

function LoadingState() {
  return (
    <section className={styles.statePanel} aria-live="polite">
      <LoaderCircle aria-hidden="true" size={24} />
      <div>
        <strong>Cargando usuarios</strong>
        <span>Preparando datos simulados del módulo administrativo.</span>
      </div>
    </section>
  );
}

function ErrorState() {
  return (
    <section className={styles.statePanel} role="alert">
      <AlertTriangle aria-hidden="true" size={24} />
      <div>
        <strong>No pudimos cargar usuarios</strong>
        <span>Intenta nuevamente con los datos simulados.</span>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className={styles.emptyState}>
      <UserCog aria-hidden="true" size={25} />
      <strong>No encontramos usuarios</strong>
      <span>Prueba otra búsqueda o cambia el filtro de estado.</span>
    </div>
  );
}
