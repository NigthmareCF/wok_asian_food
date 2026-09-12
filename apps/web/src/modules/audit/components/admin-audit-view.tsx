"use client";
import { useState } from "react";
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  FormField,
  SearchFilter,
  Workspace,
  styles,
  useAdminFilter,
  useAdminWorkspace,
  useList,
  type AuditEvent,
} from "@/modules/admin-workspace";
export function AdminAuditView() {
  const { state } = useAdminWorkspace();
  const [date, setDate] = useAdminFilter("audit.date");
  const [detail, setDetail] = useState<AuditEvent | null>(null);
  const rows = useList(
    "audit",
    state.audit,
    (a) => `${a.date} ${a.action} ${a.actor} ${a.entity}`,
    (a) => a.action,
  ).filter((a) => !date || a.date.slice(0, 10) === date);
  return (
    <Workspace
      id="A-16"
      title="Auditoría"
      description="Consulta quién cambió qué, cuándo y por qué en esta sesión administrativa."
    >
      <SearchFilter
        id="audit"
        statuses={Array.from(new Set(state.audit.map((a) => a.action)))}
        placeholder="Buscar actor, acción, entidad o fecha"
      />
      <div className={styles.toolbar}>
        <FormField
          id="audit-date"
          label="Fecha del evento"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <Button variant="secondary" onClick={() => setDate("")}>
          Todas las fechas
        </Button>
      </div>
      <DataTable
        id="audit"
        rows={rows}
        columns={[
          {
            label: "Fecha",
            render: (a) => a.date.replace("T", " ").replace("Z", " UTC"),
          },
          { label: "Actor", render: (a) => a.actor },
          { label: "Acción", render: (a) => a.action },
          { label: "Entidad", render: (a) => a.entity },
          { label: "Resultado", render: (a) => <Badge>{a.result}</Badge> },
          {
            label: "Detalle",
            render: (a) => (
              <Button variant="secondary" onClick={() => setDetail(a)}>
                Abrir evento
              </Button>
            ),
          },
        ]}
      />
      {detail && (
        <Dialog title={`Evento ${detail.id}`} onClose={() => setDetail(null)}>
          <dl>
            <dt>Actor</dt>
            <dd>{detail.actor}</dd>
            <dt>Fecha</dt>
            <dd>{detail.date}</dd>
            <dt>Acción</dt>
            <dd>{detail.action}</dd>
            <dt>Entidad</dt>
            <dd>{detail.entity}</dd>
            <dt>Motivo</dt>
            <dd>{detail.reason}</dd>
            <dt>Resultado</dt>
            <dd>{detail.result}</dd>
          </dl>
          <h3>Antes</h3>
          <pre className={styles.code}>{detail.before}</pre>
          <h3>Después</h3>
          <pre className={styles.code}>{detail.after}</pre>
        </Dialog>
      )}
    </Workspace>
  );
}
