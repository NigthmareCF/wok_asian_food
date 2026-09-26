"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
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
  reason: string;
};

type UserFormErrors = {
  email?: string;
  name?: string;
};

type BackendAdminUser = {
  id: string;
  email: string;
  displayName: string;
  status: string;
  rowVersion: number;
  roles: string[];
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
  reason: "",
};

const backendRoleNames: Record<string, string> = {
  ADMIN: "Administración",
  CLIENT: "Cliente",
  OPERATIONAL: "Operativo",
};

function mapBackendUser(user: BackendAdminUser): AdminUser {
  const status: UserStatus =
    user.status === "ACTIVE"
      ? "active"
      : user.status === "SUSPENDED"
        ? "suspended"
        : user.status === "PENDING_VERIFICATION"
          ? "pending"
          : "disabled";
  return {
    id: user.id,
    email: user.email,
    name: user.displayName,
    status,
    rowVersion: user.rowVersion,
    roles: user.roles.map((code) => ({
      id: code,
      name: backendRoleNames[code] ?? code,
      capabilities: [],
    })),
  };
}

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
  backendEnabled = false,
}: {
  initialState?: ViewState;
  backendEnabled?: boolean;
}) {
  const [users, setUsers] = useState<AdminUser[]>(
    backendEnabled ? [] : dummyAdminUsers,
  );
  const [auditEntries, setAuditEntries] = useState<UserAuditEntry[]>(
    initialUserAuditEntries,
  );
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [viewState, setViewState] = useState<ViewState>(
    backendEnabled ? "loading" : initialState,
  );
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
  const [formSaving, setFormSaving] = useState(false);
  const [apiError, setApiError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const [logoutPending, setLogoutPending] = useState(false);
  const router = useRouter();
  const backgroundRef = useRef<HTMLDivElement>(null);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  const shouldRestoreFocusRef = useRef(false);

  const isDialogOpen = Boolean(formMode) || Boolean(pendingOperation);

  useEffect(() => {
    if (!backendEnabled) return;
    const controller = new AbortController();
    fetch(`/api/admin/users?search=${encodeURIComponent(query.trim())}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = response.ok
          ? ((await response.json()) as BackendAdminUser[])
          : ((await response.json()) as { message?: string });
        if (!response.ok)
          throw new Error(
            (result as { message?: string }).message ??
              "No se pudieron consultar las cuentas.",
          );
        const nextUsers = (result as BackendAdminUser[]).map(mapBackendUser);
        setApiError("");
        setUsers(nextUsers);
        setExpandedUserId((current) =>
          nextUsers.some((user) => user.id === current)
            ? current
            : (nextUsers[0]?.id ?? ""),
        );
        setViewState("normal");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setApiError(
          error instanceof Error
            ? error.message
            : "No se pudieron consultar las cuentas.",
        );
        setViewState("error");
      });
    return () => controller.abort();
  }, [backendEnabled, query, reloadVersion]);

  async function logout() {
    setLogoutPending(true);
    try {
      await fetch("/api/session", { method: "DELETE" });
    } catch {
      /* Navigation still leaves the protected workspace. */
    }
    router.replace("/login");
  }

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
      reason: "",
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

  const saveUser = async () => {
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

    if (backendEnabled && formMode === "edit") {
      if (formState.reason.trim().length < 3) {
        setFeedback(
          "Indica un motivo de al menos 3 caracteres para registrar el cambio.",
        );
        return;
      }
      if (!selectedUser?.rowVersion) {
        setFeedback("Falta la versión actual de la cuenta. Recarga la lista.");
        return;
      }
      const changedRoles = (["ADMIN", "OPERATIONAL"] as const).filter(
        (code) =>
          formState.roleIds.includes(code) !==
          selectedUser.roles.some((role) => role.id === code),
      );
      if (changedRoles.length > 1) {
        setFeedback(
          "Guarda un cambio de rol a la vez para conservar el control de versión.",
        );
        return;
      }
      if (changedRoles.length === 0) {
        closeForm();
        return;
      }
      setFormSaving(true);
      try {
        const roleCode = changedRoles[0];
        const response = await fetch(
          `/api/admin/users/${selectedUser.id}/roles/${roleCode}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: formState.roleIds.includes(roleCode) ? "GRANT" : "REVOKE",
              reason: formState.reason.trim(),
              expectedVersion: selectedUser.rowVersion,
            }),
          },
        );
        const result = (await response.json()) as
          BackendAdminUser | { message?: string };
        if (!response.ok)
          throw new Error(
            (result as { message?: string }).message ??
              "No se pudo guardar el rol.",
          );
        const updatedUser = mapBackendUser(result as BackendAdminUser);
        setUsers((current) =>
          current.map((user) =>
            user.id === updatedUser.id ? updatedUser : user,
          ),
        );
        setFeedback(
          `Rol actualizado para ${updatedUser.name}. El cambio quedó auditado por el backend.`,
        );
        closeForm();
      } catch (error) {
        setFeedback(
          error instanceof Error ? error.message : "No se pudo guardar el rol.",
        );
      } finally {
        setFormSaving(false);
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
            <p>
              {backendEnabled
                ? "Consulta cuentas WOK y administra los roles operativos autorizados."
                : "Busca usuarios, consulta roles y valida la experiencia con datos demo."}
            </p>
          </div>
          <div className={styles.headerActions}>
            <StatusBadge
              label={backendEnabled ? "API WOK" : "DATOS SIMULADOS"}
              tone="info"
            />
            {!backendEnabled ? (
              <Button
                onClick={(event) => openCreateForm(event.currentTarget)}
                type="button"
              >
                <Plus aria-hidden="true" size={18} /> Crear usuario
              </Button>
            ) : (
              <Button
                disabled={logoutPending}
                onClick={() => void logout()}
                type="button"
                variant="secondary"
              >
                {logoutPending ? "Cerrando sesión…" : "Cerrar sesión"}
              </Button>
            )}
          </div>
        </header>

        <section className={styles.notice}>
          <ShieldCheck aria-hidden="true" size={19} />
          <span>
            {backendEnabled
              ? "El backend autoriza cada operación y conserva la auditoría. Esta pantalla solo permite asignar o retirar roles ADMIN y OPERATIONAL."
              : "Los permisos mostrados son únicamente visuales; no representan autorización real del backend."}
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
              onChange={(event) => {
                setQuery(event.target.value);
                if (backendEnabled) setViewState("loading");
              }}
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
          {!backendEnabled ? (
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
          ) : null}
        </section>

        {viewState === "loading" ? (
          <LoadingState backendEnabled={backendEnabled} />
        ) : null}
        {viewState === "error" ? (
          <ErrorState
            message={apiError}
            backendEnabled={backendEnabled}
            onRetry={() => {
              setViewState("loading");
              setReloadVersion((current) => current + 1);
            }}
          />
        ) : null}

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
                    {visibleUsers.length}{" "}
                    {backendEnabled ? "cuentas cargadas" : "resultados demo"}
                  </span>
                </div>
              </header>

              {visibleUsers.length ? (
                <>
                  <UserTable
                    backendEnabled={backendEnabled}
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
                        <span>
                          {backendEnabled
                            ? "Rol asignado por backend"
                            : `${role.capabilities.length} capacidades demo`}
                        </span>
                      </article>
                    ))}
                  </div>
                  <section
                    className={styles.capabilities}
                    aria-label="Capacidades efectivas"
                  >
                    <h3>
                      {backendEnabled
                        ? "Permisos efectivos"
                        : "Unión visual de capacidades"}
                    </h3>
                    {backendEnabled ? (
                      <p>
                        El endpoint actual expone roles; la consulta del
                        catálogo de permisos efectivos aún no está disponible.
                      </p>
                    ) : (
                      <ul>
                        {selectedCapabilities.map((capability) => (
                          <li key={capability}>{capability}</li>
                        ))}
                      </ul>
                    )}
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

        {!backendEnabled ? (
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
        ) : null}

        {!backendEnabled ? (
          <p className={styles.disclaimer}>
            Datos dummy para validar la experiencia. Los roles y capacidades no
            son un catálogo definitivo. El registro público queda pendiente de
            integración y nunca debe asignar roles operativos desde frontend.
          </p>
        ) : (
          <p className={styles.disclaimer}>
            El backend valida permisos, estado y versión; los cambios guardados
            se auditan. Alta, suspensión y edición de identidad todavía no están
            habilitadas desde esta vista.
          </p>
        )}
      </div>

      {formMode ? (
        <UserFormPanel
          errors={formErrors}
          formMode={formMode}
          formState={formState}
          onClose={closeForm}
          onRoleChange={updateRoleSelection}
          onSave={saveUser}
          formFeedback={feedback}
          backendEnabled={backendEnabled}
          saving={formSaving}
          onUpdate={updateFormState}
          reason={formState.reason}
          onReasonChange={(reason) =>
            setFormState((current) => ({ ...current, reason }))
          }
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
  backendEnabled,
  expandedUserId,
  onActivate,
  onEdit,
  onSelect,
  onSuspend,
  users,
}: {
  backendEnabled: boolean;
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
            <th>{backendEnabled ? "Permisos" : "Capacidades"}</th>
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
              <td data-label={backendEnabled ? "Permisos" : "Capacidades"}>
                {backendEnabled
                  ? "Pendiente"
                  : getEffectiveCapabilities(user.roles).length}
              </td>
              <td data-label="Acciones">
                <UserActions
                  onActivate={(origin) => onActivate(user.id, origin)}
                  onEdit={(origin) => onEdit(user, origin)}
                  onSuspend={(origin) => onSuspend(user.id, origin)}
                  backendEnabled={backendEnabled}
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
  backendEnabled,
  onActivate,
  onEdit,
  onSuspend,
  status,
}: {
  backendEnabled: boolean;
  onActivate: (origin: HTMLElement) => void;
  onEdit: (origin: HTMLElement) => void;
  onSuspend: (origin: HTMLElement) => void;
  status: UserStatus;
}) {
  return (
    <div className={styles.actions}>
      <button onClick={(event) => onEdit(event.currentTarget)} type="button">
        {backendEnabled ? "Administrar roles" : "Editar"}
      </button>
      {!backendEnabled ? (
        <>
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
        </>
      ) : null}
    </div>
  );
}

function UserFormPanel({
  backendEnabled,
  errors,
  formFeedback,
  formMode,
  formState,
  onClose,
  onRoleChange,
  onSave,
  onUpdate,
  onReasonChange,
  reason,
  saving,
}: {
  backendEnabled: boolean;
  errors: UserFormErrors;
  formFeedback: string;
  formMode: FormMode;
  formState: UserFormState;
  onClose: () => void;
  onRoleChange: (roleId: string, checked: boolean) => void;
  onSave: () => void;
  onUpdate: (state: UserFormState) => void;
  onReasonChange: (reason: string) => void;
  reason: string;
  saving: boolean;
}) {
  useEffect(() => {
    document
      .getElementById(
        backendEnabled ? "admin-user-role-admin" : "admin-user-name",
      )
      ?.focus();
  }, [backendEnabled]);

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
          <span>{backendEnabled ? "Cuenta WOK" : "Datos simulados"}</span>
          <h2 id="user-form-title">
            {backendEnabled
              ? "Administrar roles"
              : formMode === "create"
                ? "Crear usuario"
                : "Editar usuario"}
          </h2>
          <p>
            {backendEnabled
              ? "La identidad y el estado no se editan aquí. Cada cambio se valida y registra en el servidor."
              : "El estado no se edita desde este formulario. Las acciones disponibles son activar o suspender."}
          </p>
        </header>
        <div className={styles.formGrid}>
          <FormField
            aria-invalid={Boolean(errors.name)}
            help={errors.name}
            id="admin-user-name"
            label="Nombre"
            disabled={backendEnabled}
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
            disabled={backendEnabled}
            onChange={(event) =>
              onUpdate({ ...formState, email: event.target.value })
            }
            type="email"
            value={formState.email}
          />
        </div>
        <fieldset className={styles.roleFieldset}>
          <legend>Roles asignados</legend>
          {(backendEnabled
            ? [
                { id: "ADMIN", name: "Administración", capabilities: [] },
                { id: "OPERATIONAL", name: "Operativo", capabilities: [] },
              ]
            : dummyAdminRoles
          ).map((role) => (
            <label key={role.id}>
              <input
                id={
                  backendEnabled
                    ? `admin-user-role-${role.id.toLowerCase()}`
                    : undefined
                }
                checked={formState.roleIds.includes(role.id)}
                onChange={(event) =>
                  onRoleChange(role.id, event.target.checked)
                }
                type="checkbox"
              />
              <span>
                <strong>{role.name}</strong>
                <small>
                  {backendEnabled
                    ? "Permiso administrado en servidor"
                    : role.capabilities.join(", ")}
                </small>
              </span>
            </label>
          ))}
        </fieldset>
        {backendEnabled ? (
          <label className={styles.reasonField}>
            <span>Motivo obligatorio para auditoría</span>
            <textarea
              minLength={3}
              maxLength={500}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder="Describe por qué se cambia este rol"
              rows={3}
              value={reason}
            />
          </label>
        ) : null}
        {backendEnabled && formFeedback ? (
          <p role="alert">{formFeedback}</p>
        ) : null}
        <div className={styles.panelActions}>
          <Button
            disabled={saving}
            onClick={onClose}
            type="button"
            variant="secondary"
          >
            Cancelar
          </Button>
          <Button disabled={saving} onClick={() => void onSave()} type="button">
            {saving ? "Guardando…" : backendEnabled ? "Guardar rol" : "Guardar"}
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

function LoadingState({ backendEnabled }: { backendEnabled: boolean }) {
  return (
    <section className={styles.statePanel} aria-live="polite">
      <LoaderCircle aria-hidden="true" size={24} />
      <div>
        <strong>Cargando usuarios</strong>
        <span>
          {backendEnabled
            ? "Consultando cuentas autorizadas desde WOK."
            : "Preparando datos simulados del módulo administrativo."}
        </span>
      </div>
    </section>
  );
}

function ErrorState({
  message,
  backendEnabled,
  onRetry,
}: {
  message: string;
  backendEnabled: boolean;
  onRetry?: () => void;
}) {
  return (
    <section className={styles.statePanel} role="alert">
      <AlertTriangle aria-hidden="true" size={24} />
      <div>
        <strong>No pudimos cargar usuarios</strong>
        <span>
          {backendEnabled
            ? message ||
              "Revisa la conexión o inicia sesión con una cuenta Administrativa."
            : "Intenta nuevamente con los datos simulados."}
        </span>
        {backendEnabled && onRetry ? (
          <Button onClick={onRetry} type="button" variant="secondary">
            Reintentar
          </Button>
        ) : null}
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
