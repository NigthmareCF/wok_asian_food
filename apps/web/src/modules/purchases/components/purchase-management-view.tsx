"use client";
import { useState } from "react";
import {
  Badge,
  Button,
  Confirm,
  DataTable,
  Dialog,
  FormActions,
  FormField,
  Metrics,
  Notice,
  SearchFilter,
  Select,
  Workspace,
  createId,
  money,
  receivePurchase,
  styles,
  useAdminWorkspace,
  useList,
  type Purchase,
} from "@/modules/admin-workspace";
export function PurchaseManagementView() {
  const { state, commit, canManage } = useAdminWorkspace();
  const [edit, setEdit] = useState<Purchase | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [receive, setReceive] = useState<{
    id: string;
    quantities: number[];
  } | null>(null);
  const [pending, setPending] = useState<{
    title: string;
    description: string;
    run: (reason: string) => void;
  } | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const rows = useList(
    "purchases",
    state.purchases,
    (p) =>
      `${p.id} ${state.suppliers.find((s) => s.id === p.supplierId)?.name}`,
    (p) => p.status,
  );
  const detailPurchase = state.purchases.find((p) => p.id === detail);
  const receiving = state.purchases.find((p) => p.id === receive?.id);
  function save() {
    if (!edit || !canManage) return;
    if (
      !edit.lines.length ||
      edit.lines.some(
        (l) =>
          !Number.isFinite(l.quantity) ||
          l.quantity <= 0 ||
          !Number.isFinite(l.cost) ||
          l.cost < 0,
      ) ||
      new Set(edit.lines.map((l) => l.ingredientId)).size !== edit.lines.length
    ) {
      setError(
        "Agrega productos distintos con cantidades positivas y costos no negativos.",
      );
      return;
    }
    const before = state.purchases.find((p) => p.id === edit.id);
    commit(
      (s) => ({
        ...s,
        purchases: before
          ? s.purchases.map((p) => (p.id === edit.id ? edit : p))
          : [edit, ...s.purchases],
      }),
      {
        action: "Guardar solicitud de compra",
        entity: edit.id,
        before: JSON.stringify(before ?? null),
        after: JSON.stringify(edit),
        reason: "Solicitud de abastecimiento de demostración.",
      },
    );
    setEdit(null);
    setMessage("Solicitud guardada. No se modificaron las existencias.");
  }
  function transition(purchase: Purchase, status: "Comprada" | "Cancelada") {
    setPending({
      title: status === "Comprada" ? "Registrar compra" : "Cancelar solicitud",
      description:
        status === "Comprada"
          ? "Registrar la compra no ingresa productos al inventario. La recepción se registra por separado."
          : "Se conservará la solicitud cancelada en el historial.",
      run: (reason) => {
        commit(
          (s) => ({
            ...s,
            purchases: s.purchases.map((p) =>
              p.id === purchase.id ? { ...p, status } : p,
            ),
          }),
          {
            action:
              status === "Comprada" ? "Registrar compra" : "Cancelar solicitud",
            entity: purchase.id,
            before: purchase.status,
            after: status,
            reason,
          },
        );
        setMessage(
          status === "Comprada"
            ? "Compra registrada. Pendiente de recibir."
            : "Solicitud cancelada.",
        );
      },
    });
  }
  return (
    <Workspace
      id="A-08"
      title="Compras y recepciones"
      description="Solicita insumos y registra por separado su ingreso efectivo."
      actions={
        <Button
          disabled={!canManage}
          onClick={() => {
            setError("");
            setEdit({
              id: createId("PO"),
              supplierId: state.suppliers[0].id,
              date: "2026-09-12",
              status: "Solicitada",
              lines: [
                {
                  ingredientId: state.ingredients[0].id,
                  quantity: 1,
                  received: 0,
                  cost: 0,
                },
              ],
            });
          }}
        >
          Nueva solicitud
        </Button>
      }
    >
      {message && <Notice>{message}</Notice>}
      <Metrics
        items={[
          {
            label: "Solicitadas",
            value: state.purchases.filter((p) => p.status === "Solicitada")
              .length,
          },
          {
            label: "Pendientes de recibir",
            value: state.purchases.filter((p) =>
              ["Comprada", "Parcial"].includes(p.status),
            ).length,
          },
          {
            label: "Recibidas",
            value: state.purchases.filter((p) => p.status === "Recibida")
              .length,
          },
        ]}
      />
      <SearchFilter
        id="purchases"
        statuses={[
          "Solicitada",
          "Comprada",
          "Parcial",
          "Recibida",
          "Cancelada",
        ]}
      />
      <DataTable
        id="purchases"
        rows={rows}
        columns={[
          {
            label: "Compra",
            render: (p) => (
              <>
                <strong>{p.id}</strong>
                <small>{p.date}</small>
              </>
            ),
          },
          {
            label: "Proveedor",
            render: (p) =>
              state.suppliers.find((s) => s.id === p.supplierId)?.name,
          },
          {
            label: "Importe",
            render: (p) =>
              money(p.lines.reduce((sum, l) => sum + l.quantity * l.cost, 0)),
          },
          { label: "Estado", render: (p) => <Badge>{p.status}</Badge> },
          {
            label: "Acciones",
            render: (p) => (
              <div className={styles.actions}>
                <Button variant="secondary" onClick={() => setDetail(p.id)}>
                  Ver detalle
                </Button>
                {p.status === "Solicitada" && (
                  <>
                    <Button
                      disabled={!canManage}
                      variant="secondary"
                      onClick={() => {
                        setError("");
                        setEdit(structuredClone(p));
                      }}
                    >
                      Editar cantidades
                    </Button>
                    <Button
                      disabled={!canManage}
                      onClick={() => transition(p, "Comprada")}
                    >
                      Registrar compra
                    </Button>
                    <Button
                      disabled={!canManage}
                      variant="secondary"
                      onClick={() => transition(p, "Cancelada")}
                    >
                      Cancelar
                    </Button>
                  </>
                )}
                {["Comprada", "Parcial"].includes(p.status) && (
                  <Button
                    disabled={!canManage}
                    onClick={() => {
                      setError("");
                      setReceive({
                        id: p.id,
                        quantities: p.lines.map(() => 0),
                      });
                    }}
                  >
                    Registrar ingreso
                  </Button>
                )}
              </div>
            ),
          },
        ]}
      />
      <section className={styles.card}>
        <h2>Existencias de demostración</h2>
        <p>
          Solo aumentan al confirmar una recepción. No se conectan al inventario
          operativo.
        </p>
        <div className={styles.grid}>
          {state.ingredients.map((i) => (
            <span key={i.id}>
              {i.name}:{" "}
              <strong>
                {i.stock} {i.unit}
              </strong>
            </span>
          ))}
        </div>
      </section>
      {edit && (
        <Dialog title={`Solicitud ${edit.id}`} onClose={() => setEdit(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            {error && <Notice error>{error}</Notice>}
            <Select
              label="Proveedor"
              value={edit.supplierId}
              onChange={(value) => setEdit({ ...edit, supplierId: value })}
              options={state.suppliers.map((s) => ({
                value: s.id,
                label: s.name,
              }))}
            />
            <FormField
              id="purchase-date"
              label="Fecha"
              type="date"
              required
              value={edit.date}
              onChange={(e) => setEdit({ ...edit, date: e.target.value })}
            />
            {edit.lines.map((l, index) => (
              <div className={styles.card} key={index}>
                <Select
                  label={`Producto ${index + 1}`}
                  value={l.ingredientId}
                  onChange={(value) =>
                    setEdit({
                      ...edit,
                      lines: edit.lines.map((line, i) =>
                        i === index ? { ...line, ingredientId: value } : line,
                      ),
                    })
                  }
                  options={state.ingredients.map((i) => ({
                    value: i.id,
                    label: `${i.name} (${i.unit})`,
                  }))}
                />
                <div className={styles.grid}>
                  <FormField
                    id={`purchase-qty-${index}`}
                    label={`Cantidad ${index + 1}`}
                    required
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={Number.isFinite(l.quantity) ? l.quantity : ""}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        lines: edit.lines.map((line, i) =>
                          i === index
                            ? { ...line, quantity: e.target.valueAsNumber }
                            : line,
                        ),
                      })
                    }
                  />
                  <FormField
                    id={`purchase-cost-${index}`}
                    label={`Costo unitario ${index + 1} (Q)`}
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={Number.isFinite(l.cost) ? l.cost : ""}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        lines: edit.lines.map((line, i) =>
                          i === index
                            ? { ...line, cost: e.target.valueAsNumber }
                            : line,
                        ),
                      })
                    }
                  />
                </div>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() =>
                    setEdit({
                      ...edit,
                      lines: edit.lines.filter((_, i) => i !== index),
                    })
                  }
                >
                  Quitar producto {index + 1}
                </Button>
              </div>
            ))}
            <Button
              variant="secondary"
              type="button"
              onClick={() =>
                setEdit({
                  ...edit,
                  lines: [
                    ...edit.lines,
                    {
                      ingredientId: state.ingredients[0].id,
                      quantity: 1,
                      cost: 0,
                      received: 0,
                    },
                  ],
                })
              }
            >
              Agregar producto
            </Button>
            <FormActions
              onCancel={() => setEdit(null)}
              label="Guardar solicitud"
            />
          </form>
        </Dialog>
      )}
      {detailPurchase && (
        <Dialog
          title={`Detalle ${detailPurchase.id}`}
          onClose={() => setDetail(null)}
        >
          <Badge>{detailPurchase.status}</Badge>
          <ul>
            {detailPurchase.lines.map((l) => (
              <li key={l.ingredientId}>
                {state.ingredients.find((i) => i.id === l.ingredientId)?.name}:
                pedido {l.quantity} · recibido {l.received} · pendiente{" "}
                {l.quantity - l.received}
              </li>
            ))}
          </ul>
          <p>
            Total solicitado:{" "}
            {money(
              detailPurchase.lines.reduce(
                (sum, l) => sum + l.quantity * l.cost,
                0,
              ),
            )}
          </p>
        </Dialog>
      )}
      {receive && receiving && (
        <Dialog
          title={`Recepción ${receiving.id}`}
          onClose={() => setReceive(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              try {
                receivePurchase(state, receive.id, receive.quantities);
                const batch = { ...receive };
                setReceive(null);
                setPending({
                  title: "Confirmar ingreso al inventario",
                  description:
                    "Se sumarán únicamente las cantidades recibidas indicadas. Esta recepción queda auditada.",
                  run: (reason) => {
                    commit(
                      (s) => receivePurchase(s, batch.id, batch.quantities),
                      {
                        action: "Recibir compra",
                        entity: batch.id,
                        before: JSON.stringify(receiving.lines),
                        after: JSON.stringify(batch.quantities),
                        reason,
                      },
                    );
                    setMessage(
                      "Recepción registrada y existencias de demostración actualizadas.",
                    );
                  },
                });
              } catch (error) {
                setError((error as Error).message);
              }
            }}
          >
            <p>
              Indica lo recibido ahora; puedes registrar una entrega parcial.
            </p>
            {error && <Notice error>{error}</Notice>}
            {receiving.lines.map((l, index) => (
              <FormField
                key={l.ingredientId}
                id={`receive-${index}`}
                label={`${state.ingredients.find((i) => i.id === l.ingredientId)?.name} · pendiente ${l.quantity - l.received}`}
                type="number"
                min="0"
                max={l.quantity - l.received}
                step="0.001"
                required
                value={
                  Number.isFinite(receive.quantities[index])
                    ? receive.quantities[index]
                    : ""
                }
                onChange={(e) =>
                  setReceive({
                    ...receive,
                    quantities: receive.quantities.map((q, i) =>
                      i === index ? e.target.valueAsNumber : q,
                    ),
                  })
                }
              />
            ))}
            <FormActions
              onCancel={() => setReceive(null)}
              label="Revisar ingreso"
            />
          </form>
        </Dialog>
      )}
      {pending && (
        <Confirm
          {...pending}
          onClose={() => setPending(null)}
          onConfirm={pending.run}
        />
      )}
    </Workspace>
  );
}
