"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/shared/components/ui/button";
import { FormField } from "@/shared/components/ui/form-field";
import { useClientPickupResource } from "@/modules/client-order-tracking/use-client-pickup-resource";
import { useClientIdentity } from "@/modules/clients/use-client-identity";
import { createClientOperation } from "@/modules/clients/client-identity-store";
import {
  isManagedUsers,
  isManagedUser,
  type ManagedUser,
} from "../live-contract";
import styles from "./user-management.module.css";
export function LiveUserManagement({ userId }: { userId: string }) {
  const { identity, verified, refresh } = useClientIdentity(userId);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const resource = useClientPickupResource(
    `/bff/admin/users?${new URLSearchParams({ search: query, offset: String(offset) })}`,
    isManagedUsers,
    userId,
  );
  const [draft, setDraft] = useState<{
    user: ManagedUser;
    role: string;
    reason: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const lock = useRef(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!draft && !busy) trigger.current?.focus();
  }, [draft, busy]);
  async function changeRole(event: FormEvent) {
    event.preventDefault();
    if (!draft || !verified || lock.current || draft.reason.trim().length < 3)
      return;
    const action = draft.user.roles.includes(draft.role) ? "REVOKE" : "GRANT";
    lock.current = true;
    setBusy(true);
    setFeedback("");
    const operation = createClientOperation(identity);
    try {
      if (!(await operation.confirm())) return;
      const response = await fetch(
        `/bff/admin/users/${draft.user.id}/roles/${draft.role}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Wok-Expected-Principal": userId,
          },
          body: JSON.stringify({
            action,
            reason: draft.reason.trim(),
            expectedVersion: draft.user.rowVersion,
          }),
          signal: operation.signal,
        },
      );
      const body: unknown = await response.json();
      if (!(await operation.confirm())) return;
      if (
        !response.ok ||
        !isManagedUser(body) ||
        body.id !== draft.user.id ||
        body.rowVersion !== draft.user.rowVersion + 1
      ) {
        const message =
          body &&
          typeof body === "object" &&
          "message" in body &&
          typeof body.message === "string"
            ? body.message
            : "No pudimos confirmar el cambio de rol.";
        setFeedback(
          `${message} Consulta el estado actual antes de preparar otra decisión.`,
        );
      } else setFeedback("Cambio de rol confirmado por el servidor.");
      setDraft(null);
    } catch {
      if (operation.valid()) {
        setFeedback(
          "Resultado incierto. Consulta los roles actuales antes de preparar otra decisión.",
        );
        setDraft(null);
      }
    } finally {
      operation.dispose();
      lock.current = false;
      setBusy(false);
      resource.reload();
    }
  }
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Usuarios y roles</h1>
          <p>Consulta usuarios y administra sus roles existentes.</p>
        </div>
      </header>
      {!verified ? (
        <>
          <p role="status">Verifica tu sesión administrativa.</p>
          <Button onClick={() => void refresh()}>Verificar sesión</Button>
        </>
      ) : (
        <>
          <form
            className={styles.toolbar}
            onSubmit={(event) => {
              event.preventDefault();
              setQuery(search);
              setOffset(0);
              setDraft(null);
            }}
          >
            <FormField
              id="user-search"
              label="Buscar por nombre o correo"
              type="search"
              maxLength={100}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              disabled={busy}
            />
            <Button type="submit" disabled={busy}>
              Buscar
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={resource.reload}
            >
              Actualizar
            </Button>
          </form>
          {feedback && <p role="status">{feedback}</p>}
          {resource.error ? (
            <p role="alert">{resource.error.message}</p>
          ) : !resource.data ? (
            <p role="status">Consultando usuarios…</p>
          ) : (
            <div className={styles.workspace}>
              <section className={styles.listPanel} aria-label="Usuarios">
                {!resource.data.length && (
                  <p>No hay usuarios para estos filtros.</p>
                )}
                {resource.data.map((user) => (
                  <article key={user.id}>
                    <h2>{user.displayName}</h2>
                    <p>{user.email}</p>
                    <p>
                      Estado: {user.status} · Roles:{" "}
                      {user.roles.join(", ") || "Sin roles"}
                    </p>
                    <div className={styles.headerActions}>
                      {["OPERATIONAL", "ADMIN"].map((role) => (
                        <Button
                          key={role}
                          variant="secondary"
                          disabled={busy}
                          onClick={(event) => {
                            trigger.current = event.currentTarget;
                            setFeedback("");
                            setDraft({ user, role, reason: "" });
                          }}
                        >
                          {user.roles.includes(role) ? "Retirar" : "Asignar"}{" "}
                          {role === "ADMIN" ? "Administrador" : "Operativo"} a{" "}
                          {user.displayName}
                        </Button>
                      ))}
                    </div>
                  </article>
                ))}
                <div className={styles.toolbar}>
                  <Button
                    variant="secondary"
                    disabled={busy || offset === 0}
                    onClick={() => {
                      setOffset((value) => Math.max(0, value - 50));
                      setDraft(null);
                    }}
                  >
                    Anterior
                  </Button>
                  <span>Página {offset / 50 + 1}</span>
                  <Button
                    variant="secondary"
                    disabled={busy || resource.data.length < 50}
                    onClick={() => {
                      setOffset((value) => value + 50);
                      setDraft(null);
                    }}
                  >
                    Siguiente
                  </Button>
                </div>
              </section>
              {draft && (
                <form className={styles.detailPanel} onSubmit={changeRole}>
                  <h2>Confirmar cambio de acceso</h2>
                  <p>
                    {draft.user.roles.includes(draft.role)
                      ? "Retirar"
                      : "Asignar"}{" "}
                    {draft.role} a {draft.user.displayName}.
                  </p>
                  <FormField
                    id="role-reason"
                    label="Motivo"
                    required
                    minLength={3}
                    maxLength={500}
                    autoFocus
                    value={draft.reason}
                    disabled={busy}
                    onChange={(event) =>
                      setDraft({ ...draft, reason: event.target.value })
                    }
                  />
                  <Button
                    type="submit"
                    disabled={busy || draft.reason.trim().length < 3}
                  >
                    {busy ? "Guardando…" : "Confirmar cambio"}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => setDraft(null)}
                  >
                    Cancelar
                  </Button>
                </form>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
