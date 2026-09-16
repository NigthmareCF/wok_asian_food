"use client";
import { useState } from "react";
import {
  Badge,
  Button,
  Confirm,
  Dialog,
  FormActions,
  FormField,
  Notice,
  SearchFilter,
  Workspace,
  styles,
  useAdminWorkspace,
  useList,
  type Production,
} from "@/modules/admin-workspace";
export function ProductionPlanView() {
  const { state, commit, canManage } = useAdminWorkspace();
  const [edit, setEdit] = useState<Production | null>(null);
  const [pending, setPending] = useState<{
    item: Production;
    status: Production["status"];
  } | null>(null);
  const [message, setMessage] = useState("");
  const rows = useList(
    "production-plan",
    state.productions,
    (p) => p.name,
    (p) => p.status,
  );
  const groups = [
    { title: "Producción sugerida", states: ["Sugerida"] },
    { title: "Plan aprobado y activo", states: ["Aceptada", "Activa"] },
    { title: "Historial", states: ["Completada", "Descartada"] },
  ];
  return (
    <Workspace
      id="A-09"
      title="Planificación de producción"
      description="Revisa sugerencias y autoriza cada preparación de forma explícita."
    >
      {message && <Notice>{message}</Notice>}
      <SearchFilter
        id="production-plan"
        statuses={[
          "Sugerida",
          "Aceptada",
          "Activa",
          "Completada",
          "Descartada",
        ]}
      />
      <div className={styles.columns}>
        {groups.map((group) => (
          <section
            className={`${styles.card} ${styles.stack}`}
            key={group.title}
          >
            <h2>
              {group.title} ·{" "}
              {rows.filter((r) => group.states.includes(r.status)).length}
            </h2>
            {rows
              .filter((r) => group.states.includes(r.status))
              .map((p) => (
                <article className={styles.card} key={p.id}>
                  <div className={styles.header}>
                    <h3>{p.name}</h3>
                    <strong className={styles.price}>
                      {p.quantity} {p.unit}
                    </strong>
                  </div>
                  <Badge>{p.status}</Badge>
                  <p>{p.reason}</p>
                  <p>Tiempo estimado: {p.minutes} min</p>
                  <div className={styles.actions}>
                    {p.status === "Sugerida" && (
                      <>
                        <Button
                          disabled={!canManage}
                          onClick={() =>
                            setPending({ item: p, status: "Aceptada" })
                          }
                        >
                          Aceptar
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={!canManage}
                          onClick={() => setEdit({ ...p })}
                        >
                          Modificar cantidad
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={!canManage}
                          onClick={() =>
                            setPending({ item: p, status: "Descartada" })
                          }
                        >
                          Descartar
                        </Button>
                      </>
                    )}
                    {p.status === "Aceptada" && (
                      <Button
                        disabled={!canManage}
                        onClick={() =>
                          setPending({ item: p, status: "Activa" })
                        }
                      >
                        Iniciar preparación
                      </Button>
                    )}
                    {p.status === "Activa" && (
                      <Button
                        disabled={!canManage}
                        variant="secondary"
                        onClick={() =>
                          setPending({ item: p, status: "Completada" })
                        }
                      >
                        Marcar completada
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            {!rows.some((r) => group.states.includes(r.status)) && (
              <p>Sin preparaciones en este grupo.</p>
            )}
          </section>
        ))}
      </div>
      <Notice>
        Los tiempos son estimaciones de ejemplo. Este plan no ejecuta acciones
        en cocina ni modifica inventario real.
      </Notice>
      {edit && (
        <Dialog title={`Cantidad · ${edit.name}`} onClose={() => setEdit(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (
                !canManage ||
                !Number.isFinite(edit.quantity) ||
                edit.quantity <= 0
              )
                return;
              commit(
                (s) => ({
                  ...s,
                  productions: s.productions.map((p) =>
                    p.id === edit.id ? edit : p,
                  ),
                }),
                {
                  action: "Ajustar sugerencia",
                  entity: edit.name,
                  before: String(
                    state.productions.find((p) => p.id === edit.id)?.quantity,
                  ),
                  after: String(edit.quantity),
                  reason: "Ajuste manual previo a aprobación.",
                },
              );
              setEdit(null);
              setMessage(
                "Cantidad ajustada. La sugerencia todavía requiere aprobación.",
              );
            }}
          >
            <FormField
              id="production-quantity"
              label={`Cantidad (${edit.unit})`}
              type="number"
              min="0.001"
              step="0.001"
              required
              value={Number.isFinite(edit.quantity) ? edit.quantity : ""}
              onChange={(e) =>
                setEdit({ ...edit, quantity: e.target.valueAsNumber })
              }
            />
            <FormActions onCancel={() => setEdit(null)} />
          </form>
        </Dialog>
      )}
      {pending && (
        <Confirm
          title={`${pending.status} · ${pending.item.name}`}
          description={`Cambiar de ${pending.item.status} a ${pending.status}. Cantidad: ${pending.item.quantity} ${pending.item.unit}.`}
          onClose={() => setPending(null)}
          onConfirm={(reason) => {
            commit(
              (s) => ({
                ...s,
                productions: s.productions.map((p) =>
                  p.id === pending.item.id
                    ? { ...p, status: pending.status }
                    : p,
                ),
              }),
              {
                action: "Cambiar estado de producción",
                entity: pending.item.name,
                before: pending.item.status,
                after: pending.status,
                reason,
              },
            );
            setMessage(
              `Preparación ${pending.status.toLowerCase()} en esta sesión.`,
            );
          }}
        />
      )}
    </Workspace>
  );
}
