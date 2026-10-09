"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  isAdminUser,
  isAdminUserList,
  supportedAdminRoleCodes,
  type AdminUserRecord,
  type SupportedAdminRoleCode,
} from "@/modules/users/admin-user-contract";
import { Button } from "@/shared/components/ui/button";
import { StatusBadge } from "@/shared/components/ui/status-badge";
import styles from "./user-management.module.css";

const PAGE_SIZE = 20;
const roleLabels: Record<SupportedAdminRoleCode, string> = {
  ADMIN: "Administrativo",
  OPERATIONAL: "Operativo",
};
const statusLabels: Record<string, string> = {
  ACTIVE: "Activo",
  DISABLED: "Desactivado",
  PENDING_VERIFICATION: "Verificación pendiente",
  SUSPENDED: "Suspendido",
};

function statusLabel(value: string) {
  return statusLabels[value] ?? value;
}

function statusClass(value: string) {
  const normalized = value.toLowerCase();
  return `${styles.statusBadge} ${styles[`status_${normalized}`] ?? ""}`;
}

async function responseMessage(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    message?: unknown;
  } | null;
  return typeof body?.message === "string"
    ? body.message
    : "No se pudo completar la solicitud.";
}

function requestError(status: number, message: string) {
  if (status === 401) return "Tu sesión expiró. Inicia sesión nuevamente.";
  if (status === 403)
    return "Tu cuenta no tiene permiso para administrar usuarios.";
  if (status === 404) return "No encontramos el usuario o rol solicitado.";
  if (status === 409)
    return "La cuenta cambió. Actualiza la lista antes de volver a intentarlo.";
  return message;
}

export function UserManagementView() {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [roleDialog, setRoleDialog] = useState<{
    action: "GRANT" | "REVOKE";
    roleCode: SupportedAdminRoleCode;
    user: AdminUserRecord;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      if (!active) return;
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          search: query.trim(),
          limit: String(PAGE_SIZE),
          offset: String(offset),
        });
        const response = await fetch(`/bff/admin/users?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(
            requestError(response.status, await responseMessage(response)),
          );
        }
        const body: unknown = await response.json();
        if (!isAdminUserList(body))
          throw new Error("La respuesta de usuarios no es válida.");
        if (active) {
          setUsers(body);
          setSelectedUserId((current) =>
            body.some((user) => user.id === current)
              ? current
              : (body[0]?.id ?? ""),
          );
        }
      } catch (cause) {
        if (
          active &&
          !(cause instanceof DOMException && cause.name === "AbortError")
        ) {
          setUsers([]);
          setSelectedUserId("");
          setError(
            cause instanceof Error
              ? cause.message
              : "No se pudo cargar la lista de usuarios.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [offset, query, reloadVersion]);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? users[0],
    [selectedUserId, users],
  );

  const openRoleDialog = (
    user: AdminUserRecord,
    roleCode: SupportedAdminRoleCode,
  ) => {
    setRoleDialog({
      action: user.roles.includes(roleCode) ? "REVOKE" : "GRANT",
      roleCode,
      user,
    });
    setReason("");
    setDialogError("");
  };

  const closeRoleDialog = () => {
    if (saving) return;
    setRoleDialog(null);
    setReason("");
    setDialogError("");
  };

  const submitRoleChange = async () => {
    if (!roleDialog || savingRef.current) return;
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 3 || trimmedReason.length > 500) {
      setDialogError("Indica un motivo de 3 a 500 caracteres.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setDialogError("");
    try {
      const response = await fetch(
        `/bff/admin/users/${roleDialog.user.id}/roles/${roleDialog.roleCode}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: roleDialog.action,
            reason: trimmedReason,
            expectedVersion: roleDialog.user.rowVersion,
          }),
        },
      );
      if (!response.ok) {
        const message = requestError(
          response.status,
          await responseMessage(response),
        );
        setError(message);
        setRoleDialog(null);
        if (response.status === 409) setReloadVersion((value) => value + 1);
        return;
      }
      const body: unknown = await response.json();
      if (!isAdminUser(body))
        throw new Error("La respuesta actualizada no es válida.");
      setUsers((current) =>
        current.map((user) => (user.id === body.id ? body : user)),
      );
      setSelectedUserId(body.id);
      setFeedback(
        `${roleDialog.action === "GRANT" ? "Rol concedido" : "Rol revocado"}: ${roleLabels[roleDialog.roleCode]}.`,
      );
      setRoleDialog(null);
      setReason("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo actualizar el rol.",
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <div
        className={styles.backgroundContent}
        aria-hidden={roleDialog ? "true" : undefined}
      >
        <header className={styles.header}>
          <div>
            <span className="ops-kicker">Canal administrativo</span>
            <h1>Gestión de usuarios</h1>
            <p>
              Consulta cuentas y administra únicamente roles soportados por el
              backend.
            </p>
          </div>
          <div className={styles.headerActions}>
            <StatusBadge label="CONECTADO AL API" tone="success" />
            <Button
              type="button"
              disabled
              title="El backend todavía no expone creación de usuarios."
            >
              Crear usuario
            </Button>
          </div>
        </header>

        <section className={styles.notice}>
          <ShieldCheck aria-hidden="true" size={19} />
          <span>
            Crear, editar datos, activar y suspender usuarios están
            deshabilitados porque todavía no tienen endpoint autorizado.
          </span>
        </section>

        {feedback ? (
          <div className={styles.feedback} role="status">
            {feedback}
          </div>
        ) : null}
        {error ? (
          <div className={styles.feedback} role="alert">
            {error}{" "}
            <button
              type="button"
              onClick={() => setReloadVersion((value) => value + 1)}
            >
              Reintentar
            </button>
          </div>
        ) : null}

        <section className={styles.toolbar} aria-label="Controles de usuarios">
          <label className={styles.search}>
            <Search aria-hidden="true" size={18} />
            <span className="sr-only">Buscar usuario por nombre o correo</span>
            <input
              type="search"
              value={query}
              placeholder="Buscar por nombre o correo"
              onChange={(event) => {
                setQuery(event.target.value);
                setOffset(0);
              }}
            />
          </label>
        </section>

        {loading ? (
          <div className={styles.statePanel} role="status">
            <LoaderCircle aria-hidden="true" size={22} /> Cargando usuarios…
          </div>
        ) : users.length ? (
          <section
            className={styles.workspace}
            aria-label="Usuarios administrativos"
          >
            <div className={styles.listPanel}>
              <header className={styles.sectionHeading}>
                <div>
                  <h2>Usuarios</h2>
                  <span>
                    {users.length} resultados · página{" "}
                    {Math.floor(offset / PAGE_SIZE) + 1}
                  </span>
                </div>
              </header>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Usuario</th>
                      <th>Estado</th>
                      <th>Roles</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td data-label="Usuario">
                          <button
                            type="button"
                            className={styles.identityButton}
                            aria-expanded={selectedUser?.id === user.id}
                            onClick={() => setSelectedUserId(user.id)}
                          >
                            <strong>{user.displayName}</strong>
                            <span>{user.email}</span>
                          </button>
                        </td>
                        <td data-label="Estado">
                          <span className={statusClass(user.status)}>
                            {statusLabel(user.status)}
                          </span>
                        </td>
                        <td data-label="Roles">
                          {user.roles.length
                            ? user.roles
                                .map(
                                  (role) =>
                                    roleLabels[
                                      role as SupportedAdminRoleCode
                                    ] ?? role,
                                )
                                .join(", ")
                            : "Sin roles"}
                        </td>
                        <td data-label="Acciones">
                          <div className={styles.actions}>
                            {supportedAdminRoleCodes.map((roleCode) => (
                              <button
                                key={roleCode}
                                type="button"
                                disabled={saving}
                                onClick={() => openRoleDialog(user, roleCode)}
                              >
                                {user.roles.includes(roleCode)
                                  ? "Revocar"
                                  : "Conceder"}{" "}
                                {roleLabels[roleCode]}
                              </button>
                            ))}
                            <button
                              type="button"
                              disabled
                              title="El backend todavía no expone edición de datos."
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              disabled
                              title="El backend todavía no expone activación o suspensión."
                            >
                              Activar / suspender
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <nav
                className={styles.actions}
                aria-label="Paginación de usuarios"
              >
                <button
                  type="button"
                  disabled={offset === 0 || loading}
                  onClick={() =>
                    setOffset((value) => Math.max(0, value - PAGE_SIZE))
                  }
                >
                  <ChevronLeft aria-hidden="true" size={17} /> Anterior
                </button>
                <button
                  type="button"
                  disabled={users.length < PAGE_SIZE || loading}
                  onClick={() => setOffset((value) => value + PAGE_SIZE)}
                >
                  Siguiente <ChevronRight aria-hidden="true" size={17} />
                </button>
              </nav>
            </div>
            <aside className={styles.detailPanel} aria-label="Detalle de roles">
              {selectedUser ? (
                <>
                  <header>
                    <span>Roles asignados</span>
                    <h2>{selectedUser.displayName}</h2>
                    <p>{selectedUser.email}</p>
                  </header>
                  <div className={styles.roleList}>
                    {selectedUser.roles.length ? (
                      selectedUser.roles.map((role) => (
                        <article key={role}>
                          <strong>
                            {roleLabels[role as SupportedAdminRoleCode] ?? role}
                          </strong>
                          <span>{role}</span>
                        </article>
                      ))
                    ) : (
                      <p>Sin roles administrativos asignados.</p>
                    )}
                  </div>
                  <p className={styles.disclaimer}>
                    La vista de permisos y edición de roles se implementará en
                    una etapa posterior.
                  </p>
                </>
              ) : (
                <p>Selecciona un usuario.</p>
              )}
            </aside>
          </section>
        ) : (
          <div className={styles.statePanel} role="status">
            <strong>No encontramos usuarios</strong>
            <span>Ajusta la búsqueda o cambia de página.</span>
          </div>
        )}
      </div>

      {roleDialog ? (
        <div className={styles.panelBackdrop} role="presentation">
          <section
            className={styles.sidePanel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="role-change-title"
          >
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Cerrar cambio de rol"
              onClick={closeRoleDialog}
              disabled={saving}
            >
              <X aria-hidden="true" size={19} />
            </button>
            <header>
              <span>Cambio sensible</span>
              <h2 id="role-change-title">
                {roleDialog.action === "GRANT" ? "Conceder" : "Revocar"} rol
              </h2>
              <p>
                {roleDialog.user.displayName} ·{" "}
                {roleLabels[roleDialog.roleCode]}
              </p>
            </header>
            <label htmlFor="admin-role-reason">Motivo (obligatorio)</label>
            <textarea
              id="admin-role-reason"
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              aria-invalid={Boolean(dialogError)}
              aria-describedby={
                dialogError ? "admin-role-reason-error" : undefined
              }
            />
            {dialogError ? (
              <span className={styles.fieldError} id="admin-role-reason-error">
                {dialogError}
              </span>
            ) : null}
            <p>
              Se enviará la versión actual {roleDialog.user.rowVersion} para
              evitar sobrescribir cambios.
            </p>
            <div className={styles.actions}>
              <button type="button" onClick={closeRoleDialog} disabled={saving}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void submitRoleChange()}
                disabled={saving}
              >
                {saving ? "Guardando…" : "Confirmar cambio"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
