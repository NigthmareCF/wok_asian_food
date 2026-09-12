"use client";
import { useRef, useState } from "react";
import {
  Button,
  Confirm,
  FormField,
  Notice,
  TextArea,
  Workspace,
  settingsError,
  styles,
  useAdminWorkspace,
} from "@/modules/admin-workspace";
export function RestaurantSettingsView() {
  const { state, commit, canManage } = useAdminWorkspace();
  const [draft, setDraft] = useState({ ...state.settings });
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fail, setFail] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const locked = useRef(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(state.settings);
  async function save(reason: string) {
    if (locked.current || !canManage) return;
    locked.current = true;
    setSaving(true);
    setError("");
    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (fail) {
        setError(
          "No se pudieron guardar los cambios. Tu formulario se conserva; desactiva el error de ejemplo y reintenta.",
        );
        return;
      }
      commit((s) => ({ ...s, settings: { ...draft } }), {
        action: "Actualizar configuración",
        entity: "Restaurante",
        before: JSON.stringify(state.settings),
        after: JSON.stringify(draft),
        reason,
      });
      setMessage("Configuración guardada en esta sesión.");
    } finally {
      locked.current = false;
      setSaving(false);
    }
  }
  return (
    <Workspace
      id="A-13"
      title="Configuración del restaurante"
      description="Horarios, reservas y políticas configurables para la demostración."
    >
      {message && <Notice>{message}</Notice>}
      {error && <Notice error>{error}</Notice>}
      <form
        className={styles.stack}
        onSubmit={(e) => {
          e.preventDefault();
          const error = settingsError(draft);
          if (error) {
            setError(error);
            return;
          }
          setError("");
          setConfirm(true);
        }}
      >
        <div className={styles.grid}>
          <section className={styles.card}>
            <h2>Horario de atención</h2>
            <p>
              Horario diario de ejemplo. Los turnos nocturnos y horarios por día
              requieren definición posterior.
            </p>
            <label className={styles.check}>
              <input
                type="checkbox"
                disabled={!canManage || saving}
                checked={draft.closed}
                onChange={(e) =>
                  setDraft({ ...draft, closed: e.target.checked })
                }
              />
              Cerrado al público
            </label>
            <div className={styles.grid}>
              <FormField
                id="settings-opening"
                label="Apertura"
                type="time"
                disabled={!canManage || draft.closed || saving}
                value={draft.opening}
                onChange={(e) =>
                  setDraft({ ...draft, opening: e.target.value })
                }
              />
              <FormField
                id="settings-closing"
                label="Cierre"
                type="time"
                disabled={!canManage || draft.closed || saving}
                value={draft.closing}
                onChange={(e) =>
                  setDraft({ ...draft, closing: e.target.value })
                }
              />
            </div>
          </section>
          <section className={styles.card}>
            <h2>Reservaciones</h2>
            <div className={styles.stack}>
              <FormField
                id="settings-limit"
                label="Límite de reservas por franja"
                type="number"
                min="1"
                step="1"
                required
                disabled={!canManage || saving}
                value={
                  Number.isFinite(draft.reservationLimit)
                    ? draft.reservationLimit
                    : ""
                }
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    reservationLimit: e.target.valueAsNumber,
                  })
                }
              />
              <FormField
                id="settings-tolerance"
                label="Tolerancia (minutos)"
                type="number"
                min="0"
                required
                disabled={!canManage || saving}
                value={Number.isFinite(draft.tolerance) ? draft.tolerance : ""}
                onChange={(e) =>
                  setDraft({ ...draft, tolerance: e.target.valueAsNumber })
                }
              />
            </div>
          </section>
          <section className={styles.card}>
            <h2>Servicios y propina</h2>
            <FormField
              id="settings-tip"
              label="Propina sugerida (%)"
              type="number"
              min="0"
              max="100"
              step="0.1"
              required
              disabled={!canManage || saving}
              value={Number.isFinite(draft.tip) ? draft.tip : ""}
              onChange={(e) =>
                setDraft({ ...draft, tip: e.target.valueAsNumber })
              }
            />
            <label className={styles.check}>
              <input
                type="checkbox"
                disabled={!canManage || saving}
                checked={draft.deliveryEnabled}
                onChange={(e) =>
                  setDraft({ ...draft, deliveryEnabled: e.target.checked })
                }
              />
              Servicio de delivery habilitado
            </label>
            <p>
              Estos parámetros no aplican cargos ni cambian el canal Operativo.
            </p>
          </section>
          <section className={styles.card}>
            <h2>Política de reservas</h2>
            <fieldset
              disabled={!canManage || saving}
              style={{ border: 0, padding: 0 }}
            >
              <TextArea
                label="Política"
                value={draft.reservationPolicy}
                onChange={(value) =>
                  setDraft({ ...draft, reservationPolicy: value })
                }
                required
              />
            </fieldset>
          </section>
        </div>
        <div className={styles.header}>
          <span role="status">
            {saving
              ? "Guardando…"
              : dirty
                ? "Cambios pendientes"
                : "Sin cambios pendientes"}
          </span>
          <div className={styles.actions}>
            <Button
              variant="secondary"
              type="button"
              disabled={!dirty || saving}
              onClick={() => {
                setDraft({ ...state.settings });
                setError("");
                setMessage("Cambios descartados.");
              }}
            >
              Descartar cambios
            </Button>
            <Button type="submit" disabled={!dirty || !canManage || saving}>
              {saving ? "Guardando…" : "Revisar cambios"}
            </Button>
          </div>
        </div>
        <details>
          <summary>Escenario de guardado</summary>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={fail}
              onChange={(e) => setFail(e.target.checked)}
            />
            Simular error al guardar
          </label>
        </details>
      </form>
      {confirm && (
        <Confirm
          title="Confirmar configuración"
          description="Los nuevos parámetros se guardarán únicamente en la sesión de demostración. Indica el motivo del cambio."
          onClose={() => setConfirm(false)}
          onConfirm={(reason) => void save(reason)}
        />
      )}
    </Workspace>
  );
}
