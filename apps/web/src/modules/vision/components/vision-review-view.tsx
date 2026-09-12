"use client";
import { useState } from "react";
import {
  Badge,
  Button,
  Confirm,
  Notice,
  SearchFilter,
  Workspace,
  styles,
  useAdminWorkspace,
  useList,
  type Signal,
} from "@/modules/admin-workspace";
export function VisionReviewView() {
  const { state, commit, canManage } = useAdminWorkspace();
  const [pending, setPending] = useState<{
    signal: Signal;
    status: "Confirmada" | "Rechazada";
  } | null>(null);
  const [message, setMessage] = useState("");
  const rows = useList(
    "vision",
    state.signals,
    (s) => `${s.camera} ${s.description}`,
    (s) => (s.available ? s.status : "No disponible"),
  );
  return (
    <Workspace
      id="A-15"
      title="Cámaras y revisión de señales"
      description="Evalúa señales complementarias con confianza visible y criterio humano."
    >
      <Notice>
        Fuentes y detecciones sintéticas. No hay cámaras conectadas ni cambios
        automáticos de mesas, pedidos o inventario.
      </Notice>
      {message && <Notice>{message}</Notice>}
      <SearchFilter
        id="vision"
        statuses={["Pendiente", "Confirmada", "Rechazada", "No disponible"]}
      />
      <div className={styles.grid}>
        {rows.map((s) => (
          <article className={`${styles.card} ${styles.stack}`} key={s.id}>
            <div className={styles.header}>
              <h2>{s.camera}</h2>
              <Badge>{s.available ? s.status : "No disponible"}</Badge>
            </div>
            <div className={styles.signal}>
              {s.available
                ? "Señal de ejemplo · Sin video real"
                : "Fuente de ejemplo no disponible"}
            </div>
            <h3>{s.description}</h3>
            <small>{s.date.replace("T", " · ")}</small>
            {s.available && (
              <>
                <div>
                  Confianza: <strong>{s.confidence}%</strong>
                  {s.lowConfidence && (
                    <p>
                      Baja confianza en este ejemplo. Requiere verificación
                      humana.
                    </p>
                  )}
                  <div className={styles.bar} aria-hidden="true">
                    <span style={{ width: `${s.confidence}%` }} />
                  </div>
                </div>
                {s.status === "Pendiente" ? (
                  <div className={styles.actions}>
                    <Button
                      disabled={!canManage}
                      onClick={() =>
                        setPending({ signal: s, status: "Confirmada" })
                      }
                    >
                      Confirmar señal
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={!canManage}
                      onClick={() =>
                        setPending({ signal: s, status: "Rechazada" })
                      }
                    >
                      Rechazar señal
                    </Button>
                  </div>
                ) : (
                  <p>Motivo de revisión: {s.reason}</p>
                )}
              </>
            )}
          </article>
        ))}
      </div>
      {!rows.length && (
        <div className={styles.empty} role="status">
          No hay señales con estos filtros.
        </div>
      )}
      {pending && (
        <Confirm
          title={`${pending.status === "Confirmada" ? "Confirmar" : "Rechazar"} señal`}
          description={`${pending.signal.description} Confianza: ${pending.signal.confidence}%. La decisión solo registra tu revisión y no ejecuta operaciones.`}
          onClose={() => setPending(null)}
          onConfirm={(reason) => {
            commit(
              (s) => ({
                ...s,
                signals: s.signals.map((signal) =>
                  signal.id === pending.signal.id
                    ? { ...signal, status: pending.status, reason }
                    : signal,
                ),
              }),
              {
                action: "Revisar señal visual",
                entity: pending.signal.camera,
                before: pending.signal.status,
                after: pending.status,
                reason,
              },
            );
            setMessage(
              "Revisión registrada. No se modificaron operaciones del restaurante.",
            );
          }}
        />
      )}
    </Workspace>
  );
}
