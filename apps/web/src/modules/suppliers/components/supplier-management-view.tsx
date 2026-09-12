"use client";
import { useState } from "react";
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  FormActions,
  FormField,
  Notice,
  SearchFilter,
  Select,
  Workspace,
  createId,
  money,
  styles,
  useAdminWorkspace,
  useList,
  type Supplier,
} from "@/modules/admin-workspace";
export function SupplierManagementView() {
  const { state, commit, canManage } = useAdminWorkspace();
  const [edit, setEdit] = useState<Supplier | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const rows = useList(
    "suppliers",
    state.suppliers,
    (s) => `${s.name} ${s.contact}`,
    (s) => s.status,
  );
  const supplier = state.suppliers.find((s) => s.id === detail);
  return (
    <Workspace
      id="A-07"
      title="Proveedores"
      description="Contactos, productos asociados e historial de abastecimiento."
      actions={
        <Button
          disabled={!canManage}
          onClick={() => {
            setError("");
            setEdit({
              id: createId("sup"),
              name: "",
              contact: "",
              email: "",
              phone: "",
              products: [],
              preferred: false,
              status: "Activo",
            });
          }}
        >
          Nuevo proveedor
        </Button>
      }
    >
      {message && <Notice>{message}</Notice>}
      <SearchFilter id="suppliers" statuses={["Activo", "Incidencia"]} />
      <DataTable
        id="suppliers"
        rows={rows}
        columns={[
          {
            label: "Proveedor",
            render: (s) => (
              <>
                <strong>{s.name}</strong>
                {s.preferred && <Badge>Preferido</Badge>}
              </>
            ),
          },
          {
            label: "Contacto",
            render: (s) => (
              <>
                {s.contact}
                <br />
                <small>
                  {s.email} · {s.phone}
                </small>
              </>
            ),
          },
          {
            label: "Productos",
            render: (s) =>
              s.products.length
                ? s.products
                    .map(
                      (id) => state.ingredients.find((i) => i.id === id)?.name,
                    )
                    .join(", ")
                : "Sin productos asociados",
          },
          { label: "Estado", render: (s) => <Badge>{s.status}</Badge> },
          {
            label: "Acciones",
            render: (s) => (
              <div className={styles.actions}>
                <Button variant="secondary" onClick={() => setDetail(s.id)}>
                  Ver historial
                </Button>
                <Button
                  variant="secondary"
                  disabled={!canManage}
                  onClick={() => {
                    setError("");
                    setEdit(structuredClone(s));
                  }}
                >
                  Editar
                </Button>
                <Button
                  variant="secondary"
                  disabled={!canManage}
                  onClick={() => {
                    commit(
                      (current) => ({
                        ...current,
                        suppliers: current.suppliers.map((item) =>
                          item.id === s.id
                            ? { ...item, preferred: !s.preferred }
                            : item,
                        ),
                      }),
                      {
                        action: "Cambiar preferencia",
                        entity: s.name,
                        before: String(s.preferred),
                        after: String(!s.preferred),
                        reason: "Selección manual de proveedor.",
                      },
                    );
                    setMessage("Preferencia actualizada.");
                  }}
                >
                  {s.preferred ? "Quitar preferido" : "Marcar preferido"}
                </Button>
              </div>
            ),
          },
        ]}
      />
      {edit && (
        <Dialog title="Datos del proveedor" onClose={() => setEdit(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!canManage) return;
              if (!edit.name.trim() || !edit.contact.trim()) {
                setError("Completa el nombre y el contacto.");
                return;
              }
              const before = state.suppliers.find((s) => s.id === edit.id);
              commit(
                (s) => ({
                  ...s,
                  suppliers: before
                    ? s.suppliers.map((item) =>
                        item.id === edit.id ? edit : item,
                      )
                    : [edit, ...s.suppliers],
                }),
                {
                  action: "Guardar proveedor",
                  entity: edit.name,
                  before: JSON.stringify(before ?? null),
                  after: JSON.stringify(edit),
                  reason: "Edición de contacto y productos.",
                },
              );
              setEdit(null);
              setMessage("Proveedor guardado.");
            }}
          >
            {error && <Notice error>{error}</Notice>}
            <FormField
              id="supplier-name"
              label="Nombre comercial"
              required
              value={edit.name}
              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
            />
            <FormField
              id="supplier-contact"
              label="Persona de contacto"
              required
              value={edit.contact}
              onChange={(e) => setEdit({ ...edit, contact: e.target.value })}
            />
            <div className={styles.grid}>
              <FormField
                id="supplier-email"
                label="Correo"
                type="email"
                required
                value={edit.email}
                onChange={(e) => setEdit({ ...edit, email: e.target.value })}
              />
              <FormField
                id="supplier-phone"
                label="Teléfono"
                type="tel"
                value={edit.phone}
                onChange={(e) => setEdit({ ...edit, phone: e.target.value })}
              />
            </div>
            <Select
              label="Estado del proveedor"
              value={edit.status}
              onChange={(value) =>
                setEdit({ ...edit, status: value as Supplier["status"] })
              }
              options={["Activo", "Incidencia"]}
            />
            <fieldset>
              <legend>Productos asociados</legend>
              {state.ingredients.map((i) => (
                <label className={styles.check} key={i.id}>
                  <input
                    type="checkbox"
                    checked={edit.products.includes(i.id)}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        products: e.target.checked
                          ? [...edit.products, i.id]
                          : edit.products.filter((id) => id !== i.id),
                      })
                    }
                  />
                  {i.name}
                </label>
              ))}
            </fieldset>
            <FormActions onCancel={() => setEdit(null)} />
          </form>
        </Dialog>
      )}
      {supplier && (
        <Dialog
          title={`Historial · ${supplier.name}`}
          onClose={() => setDetail(null)}
        >
          <p>
            {supplier.contact} · {supplier.email}
          </p>
          <DataTable
            id="supplier-history"
            rows={state.purchases.filter((p) => p.supplierId === supplier.id)}
            columns={[
              { label: "Compra", render: (p) => p.id },
              { label: "Fecha", render: (p) => p.date },
              { label: "Estado", render: (p) => <Badge>{p.status}</Badge> },
              {
                label: "Importe",
                render: (p) =>
                  money(
                    p.lines.reduce((sum, l) => sum + l.cost * l.quantity, 0),
                  ),
              },
            ]}
            empty="Este proveedor aún no tiene compras asociadas."
          />
        </Dialog>
      )}
    </Workspace>
  );
}
