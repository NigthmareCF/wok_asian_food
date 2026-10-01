"use client";
import { useState } from "react";
import {
  Badge,
  Button,
  Confirm,
  DataTable,
  Dialog,
  FormActions,
  Notice,
  SearchFilter,
  Select,
  TextArea,
  Workspace,
  createId,
  money,
  styles,
  useAdminWorkspace,
  useList,
  type ClientRecord,
} from "@/modules/admin-workspace";
const status = (c: ClientRecord) =>
  c.restrictions.some((r) => r.active) ? "Restringido" : c.status;
export function AdminClientsView() {
  const { state, commit, canManage } = useAdminWorkspace();
  const [selected, setSelected] = useState<string | null>(null);
  const [restriction, setRestriction] = useState<{
    clientId: string;
    scope: string;
    reason: string;
  } | null>(null);
  const [incident, setIncident] = useState<{
    clientId: string;
    reason: string;
  } | null>(null);
  const [remove, setRemove] = useState<{
    client: ClientRecord;
    restrictionId: string;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const rows = useList(
    "admin-clients",
    state.clients,
    (c) => `${c.name} ${c.email}`,
    status,
  );
  const client = state.clients.find((c) => c.id === selected);
  return (
    <Workspace
      id="A-12"
      title="Clientes e incidencias"
      description="Consulta historial y administra restricciones internas específicas."
    >
      {message && <Notice>{message}</Notice>}
      <SearchFilter
        id="admin-clients"
        statuses={["Activo", "Eliminado", "Suspendido", "Restringido"]}
      />
      <DataTable
        id="admin-clients"
        rows={rows}
        columns={[
          {
            label: "Cliente",
            render: (c) => (
              <>
                <strong>{c.name}</strong>
                <small>{c.email}</small>
              </>
            ),
          },
          { label: "Pedidos", render: (c) => c.orders.length },
          { label: "Incidencias", render: (c) => c.incidents.length },
          { label: "Estado", render: (c) => <Badge>{status(c)}</Badge> },
          {
            label: "Acciones",
            render: (c) => (
              <div className={styles.actions}>
                <Button variant="secondary" onClick={() => setSelected(c.id)}>
                  Consultar historial
                </Button>
                <Button
                  disabled={!canManage || c.status === "Eliminado"}
                  variant="secondary"
                  onClick={() => {
                    setError("");
                    setRestriction({
                      clientId: c.id,
                      scope: "Reservaciones",
                      reason: "",
                    });
                  }}
                >
                  Aplicar restricción
                </Button>
                <Button
                  disabled={!canManage || c.status === "Eliminado"}
                  variant="secondary"
                  onClick={() => setIncident({ clientId: c.id, reason: "" })}
                >
                  Registrar incidencia
                </Button>
              </div>
            ),
          },
        ]}
      />
      {client && (
        <Dialog
          title={`Historial · ${client.name}`}
          onClose={() => setSelected(null)}
        >
          <Badge>{status(client)}</Badge>
          <h3>Pedidos</h3>
          {client.orders.length ? (
            <ul>
              {client.orders.map((o) => (
                <li key={o.id}>
                  {o.id} · {o.date} · {money(o.total)}
                </li>
              ))}
            </ul>
          ) : (
            <p>Sin pedidos registrados.</p>
          )}
          <h3>Incidencias internas</h3>
          {client.incidents.length ? (
            <ul>
              {client.incidents.map((i) => (
                <li key={i.id}>
                  {i.date} · {i.reason}
                </li>
              ))}
            </ul>
          ) : (
            <p>Sin incidencias.</p>
          )}
          <h3>Restricciones</h3>
          {client.restrictions.length ? (
            client.restrictions.map((r) => (
              <div className={styles.card} key={r.id}>
                <strong>
                  {r.scope} · {r.active ? "Activa" : "Retirada"}
                </strong>
                <p>{r.reason}</p>
                {r.active && (
                  <Button
                    disabled={!canManage}
                    variant="secondary"
                    onClick={() => {
                      setSelected(null);
                      setRemove({ client, restrictionId: r.id });
                    }}
                  >
                    Retirar restricción
                  </Button>
                )}
              </div>
            ))
          ) : (
            <p>Sin restricciones.</p>
          )}
        </Dialog>
      )}
      {restriction && (
        <Dialog
          title="Aplicar restricción interna"
          onClose={() => setRestriction(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!canManage || !restriction.reason.trim()) return;
              const client = state.clients.find(
                (c) => c.id === restriction.clientId,
              );
              if (
                client?.restrictions.some(
                  (r) => r.active && r.scope === restriction.scope,
                )
              ) {
                setError("Ya existe una restricción activa para este alcance.");
                return;
              }
              const entry = {
                id: createId("restriction"),
                scope: restriction.scope,
                reason: restriction.reason.trim(),
                active: true,
              };
              commit(
                (s) => ({
                  ...s,
                  clients: s.clients.map((c) =>
                    c.id === restriction.clientId
                      ? { ...c, restrictions: [...c.restrictions, entry] }
                      : c,
                  ),
                }),
                {
                  action: "Aplicar restricción",
                  entity: client?.name ?? restriction.clientId,
                  before: "Sin restricción en este alcance",
                  after: entry.scope,
                  reason: entry.reason,
                },
              );
              setRestriction(null);
              setMessage("Restricción interna aplicada y auditada.");
            }}
          >
            <p>
              Confirma una restricción específica. No modifica otros servicios
              ni se comunica al cliente.
            </p>
            {error && <Notice error>{error}</Notice>}
            <Select
              label="Alcance de la restricción"
              value={restriction.scope}
              onChange={(scope) => setRestriction({ ...restriction, scope })}
              options={[
                "Reservaciones",
                "Pedidos a domicilio",
                "Pedidos en línea",
              ]}
            />
            <TextArea
              label="Motivo de restricción"
              value={restriction.reason}
              onChange={(reason) => setRestriction({ ...restriction, reason })}
              required
            />
            <FormActions
              onCancel={() => setRestriction(null)}
              label="Confirmar restricción"
              disabled={!restriction.reason.trim()}
            />
          </form>
        </Dialog>
      )}
      {incident && (
        <Dialog
          title="Registrar incidencia interna"
          onClose={() => setIncident(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!canManage || !incident.reason.trim()) return;
              const entry = {
                id: createId("inc"),
                date: new Date().toISOString().slice(0, 10),
                reason: incident.reason.trim(),
              };
              commit(
                (s) => ({
                  ...s,
                  clients: s.clients.map((c) =>
                    c.id === incident.clientId
                      ? { ...c, incidents: [entry, ...c.incidents] }
                      : c,
                  ),
                }),
                {
                  action: "Registrar incidencia",
                  entity: incident.clientId,
                  before: "Sin registro",
                  after: entry.reason,
                  reason: entry.reason,
                },
              );
              setIncident(null);
              setMessage("Incidencia registrada.");
            }}
          >
            <TextArea
              label="Descripción de la incidencia"
              value={incident.reason}
              onChange={(reason) => setIncident({ ...incident, reason })}
              required
            />
            <FormActions
              onCancel={() => setIncident(null)}
              label="Guardar incidencia"
              disabled={!incident.reason.trim()}
            />
          </form>
        </Dialog>
      )}
      {remove && (
        <Confirm
          title="Retirar restricción"
          description={`Se retirará la restricción de ${remove.client.name}. Su registro histórico se conservará.`}
          onClose={() => setRemove(null)}
          onConfirm={(reason) => {
            commit(
              (s) => ({
                ...s,
                clients: s.clients.map((c) =>
                  c.id === remove.client.id
                    ? {
                        ...c,
                        restrictions: c.restrictions.map((r) =>
                          r.id === remove.restrictionId
                            ? { ...r, active: false }
                            : r,
                        ),
                      }
                    : c,
                ),
              }),
              {
                action: "Retirar restricción",
                entity: remove.client.name,
                before: "Activa",
                after: "Retirada",
                reason,
              },
            );
            setMessage("Restricción retirada; historial conservado.");
          }}
        />
      )}
    </Workspace>
  );
}
