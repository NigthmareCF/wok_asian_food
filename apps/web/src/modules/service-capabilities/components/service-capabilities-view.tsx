"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, X } from "lucide-react";
import {
  capabilityStatuses,
  isAdminServiceCapability,
  isAdminServiceCapabilityList,
  type AdminServiceCapability,
  type CapabilityStatus,
} from "@/modules/service-capabilities/admin-capability-contract";
import { Button, styles } from "@/modules/admin-workspace";

const statusLabels: Record<CapabilityStatus, string> = {
  ENABLED: "Habilitado",
  MANUAL_APPROVAL: "Aprobación manual",
  PAUSED: "Pausado",
  DISABLED: "Deshabilitado",
};

function statusLabel(status: CapabilityStatus) {
  return statusLabels[status];
}

async function readMessage(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    message?: unknown;
  } | null;
  return typeof body?.message === "string"
    ? body.message
    : "No se pudo completar la solicitud.";
}

function apiError(status: number, message: string) {
  if (status === 401) return "Tu sesión expiró. Inicia sesión nuevamente.";
  if (status === 403)
    return "Tu cuenta no tiene permiso para gestionar capacidades.";
  if (status === 404) return "No encontramos la capacidad solicitada.";
  if (status === 409)
    return "La capacidad cambió. Actualiza la vista antes de volver a intentarlo.";
  return message;
}

function requestId() {
  return (
    globalThis.crypto?.randomUUID?.() ?? "00000000-0000-4000-8000-000000000000"
  );
}

export function ServiceCapabilitiesView() {
  const [capabilities, setCapabilities] = useState<AdminServiceCapability[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [editing, setEditing] = useState<AdminServiceCapability | null>(null);
  const [draftStatus, setDraftStatus] = useState<CapabilityStatus>("ENABLED");
  const [draftReason, setDraftReason] = useState("");
  const [formError, setFormError] = useState("");
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
        const response = await fetch("/bff/admin/service-capabilities", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(
            apiError(response.status, await readMessage(response)),
          );
        const body: unknown = await response.json();
        if (!isAdminServiceCapabilityList(body))
          throw new Error("La respuesta de capacidades no es válida.");
        if (active) setCapabilities(body);
      } catch (cause) {
        if (
          active &&
          !(cause instanceof DOMException && cause.name === "AbortError")
        ) {
          setCapabilities([]);
          setError(
            cause instanceof Error
              ? cause.message
              : "No se pudieron cargar las capacidades.",
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
  }, [reloadVersion]);

  const openEditor = (capability: AdminServiceCapability) => {
    setEditing(capability);
    setDraftStatus(capability.status);
    setDraftReason(capability.reason);
    setFormError("");
  };

  const closeEditor = () => {
    if (saving) return;
    setEditing(null);
    setFormError("");
  };

  const save = async () => {
    if (!editing || savingRef.current) return;
    const reason = draftReason.trim();
    if (reason.length < 3 || reason.length > 500) {
      setFormError("El motivo debe tener entre 3 y 500 caracteres.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setFormError("");
    try {
      const response = await fetch(
        `/bff/admin/service-capabilities/${encodeURIComponent(editing.code)}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Request-Id": requestId(),
          },
          body: JSON.stringify({
            status: draftStatus,
            reason,
            expectedVersion: editing.rowVersion,
          }),
        },
      );
      if (!response.ok) {
        const message = apiError(response.status, await readMessage(response));
        setError(message);
        setEditing(null);
        if (response.status === 409) setReloadVersion((value) => value + 1);
        return;
      }
      const body: unknown = await response.json();
      if (!isAdminServiceCapability(body))
        throw new Error("La respuesta actualizada no es válida.");
      setCapabilities((current) =>
        current.map((item) => (item.code === body.code ? body : item)),
      );
      setFeedback(`Capacidad ${body.code} actualizada.`);
      setEditing(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo actualizar la capacidad.",
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <section
      className={styles.workspace}
      aria-labelledby="service-capabilities-title"
    >
      <header className={styles.header}>
        <div>
          <span className="eyebrow">ADMINISTRACIÓN / E6.2</span>
          <h1 id="service-capabilities-title">Capacidades de servicio</h1>
          <p>
            Estado operativo persistido. Esta sección no modifica los ajustes
            locales del restaurante.
          </p>
        </div>
      </header>
      {feedback ? (
        <div className={styles.notice} role="status">
          {feedback}
        </div>
      ) : null}
      {error ? (
        <div className={styles.error} role="alert">
          {error}{" "}
          <Button
            variant="secondary"
            onClick={() => setReloadVersion((value) => value + 1)}
          >
            Reintentar
          </Button>
        </div>
      ) : null}
      {loading ? (
        <div className={styles.empty} role="status" aria-busy="true">
          <LoaderCircle aria-hidden="true" size={20} /> Cargando capacidades…
        </div>
      ) : capabilities.length ? (
        <div className={styles.panel}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Código</th>
                <th>Estado</th>
                <th>Motivo</th>
                <th>Versión</th>
                <th>Vigencia</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {capabilities.map((capability) => (
                <tr key={capability.code}>
                  <td data-label="Código">
                    <strong>{capability.code}</strong>
                  </td>
                  <td data-label="Estado">{statusLabel(capability.status)}</td>
                  <td data-label="Motivo">{capability.reason}</td>
                  <td data-label="Versión">
                    {capability.rowVersion} / política{" "}
                    {capability.policyVersion}
                  </td>
                  <td data-label="Vigencia">
                    {new Date(capability.effectiveFrom).toLocaleString("es-GT")}{" "}
                    ·{" "}
                    {capability.effectiveUntil
                      ? new Date(capability.effectiveUntil).toLocaleString(
                          "es-GT",
                        )
                      : "sin vencimiento"}
                  </td>
                  <td data-label="Acción">
                    <Button
                      variant="secondary"
                      onClick={() => openEditor(capability)}
                      disabled={saving}
                    >
                      Editar estado
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.empty} role="status">
          <strong>No hay capacidades activas para mostrar.</strong>
        </div>
      )}
      {editing ? (
        <div
          className={styles.dialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby="capability-dialog-title"
        >
          <div className={styles.dialogHeader}>
            <h2 id="capability-dialog-title">
              Confirmar capacidad {editing.code}
            </h2>
            <Button
              variant="secondary"
              aria-label="Cerrar diálogo"
              onClick={closeEditor}
              disabled={saving}
            >
              <X aria-hidden="true" size={18} />
            </Button>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <p>
              Solo se actualizarán `status`, `reason` y la versión esperada del
              contrato.
            </p>
            <label className={styles.field} htmlFor="capability-status">
              Estado
              <select
                id="capability-status"
                value={draftStatus}
                onChange={(event) =>
                  setDraftStatus(event.target.value as CapabilityStatus)
                }
                disabled={saving}
              >
                {capabilityStatuses.map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field} htmlFor="capability-reason">
              Motivo
              <textarea
                id="capability-reason"
                value={draftReason}
                maxLength={500}
                onChange={(event) => setDraftReason(event.target.value)}
                disabled={saving}
                aria-invalid={Boolean(formError)}
                aria-describedby={
                  formError ? "capability-reason-error" : undefined
                }
              />
            </label>
            {formError ? (
              <span className={styles.error} id="capability-reason-error">
                {formError}
              </span>
            ) : null}
            <p>
              Versión esperada: {editing.rowVersion}. La confirmación enviará un
              `X-Request-Id` nuevo.
            </p>
            <div className={styles.actions}>
              <Button
                variant="secondary"
                type="button"
                onClick={closeEditor}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando…" : "Confirmar cambio"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
