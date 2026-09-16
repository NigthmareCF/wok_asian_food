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
  Notice,
  SearchFilter,
  Select,
  TextArea,
  Workspace,
  createId,
  styles,
  useAdminWorkspace,
  useList,
  type Template,
} from "@/modules/admin-workspace";
export function AiTemplatesView() {
  const { state, commit, canManage } = useAdminWorkspace();
  const [edit, setEdit] = useState<Template | null>(null);
  const [preview, setPreview] = useState<Template | null>(null);
  const [remove, setRemove] = useState<Template | null>(null);
  const [message, setMessage] = useState("");
  const rows = useList(
    "ai-templates",
    state.templates,
    (t) => `${t.name} ${t.channel}`,
    (t) => (t.enabled ? "Disponible para revisión" : "Borrador"),
  );
  return (
    <Workspace
      id="A-14"
      title="IA y mensajería"
      description="Plantillas locales y capacidades sujetas a revisión humana."
      actions={
        <Button
          disabled={!canManage}
          onClick={() =>
            setEdit({
              id: createId("tpl"),
              name: "",
              channel: "Web",
              content: "",
              enabled: false,
            })
          }
        >
          Nueva plantilla
        </Button>
      }
    >
      <Notice>
        Alcance de IA pendiente de confirmación. No hay modelo conectado, envío
        de mensajes ni ejecución autónoma.
      </Notice>
      {message && <Notice>{message}</Notice>}
      <div className={styles.grid}>
        <section className={styles.card}>
          <h2>Capacidades de esta demostración</h2>
          <ul>
            <li>Editar y previsualizar plantillas locales.</li>
            <li>Registrar cambios en la auditoría simulada.</li>
            <li>Revisión humana antes de usar cualquier contenido.</li>
          </ul>
        </section>
        <section className={styles.card}>
          <h2>Integraciones</h2>
          <p>
            Web, WhatsApp e Instagram son etiquetas de referencia. Sus
            conexiones están pendientes.
          </p>
          <Badge>No conectado</Badge>
          <p>
            Promociones, descuentos, pagos y cambios de disponibilidad no están
            habilitados.
          </p>
        </section>
      </div>
      <SearchFilter
        id="ai-templates"
        statuses={["Disponible para revisión", "Borrador"]}
      />
      <DataTable
        id="ai-templates"
        rows={rows}
        columns={[
          { label: "Plantilla", render: (t) => <strong>{t.name}</strong> },
          { label: "Canal previsto", render: (t) => t.channel },
          {
            label: "Estado",
            render: (t) => (
              <Badge>
                {t.enabled ? "Disponible para revisión" : "Borrador"}
              </Badge>
            ),
          },
          {
            label: "Acciones",
            render: (t) => (
              <div className={styles.actions}>
                <Button variant="secondary" onClick={() => setPreview(t)}>
                  Previsualizar
                </Button>
                <Button
                  variant="secondary"
                  disabled={!canManage}
                  onClick={() => setEdit({ ...t })}
                >
                  Editar
                </Button>
                <Button
                  variant="secondary"
                  disabled={!canManage}
                  onClick={() => setRemove(t)}
                >
                  Eliminar
                </Button>
              </div>
            ),
          },
        ]}
      />
      {edit && (
        <Dialog title="Editar plantilla local" onClose={() => setEdit(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!canManage || !edit.name.trim() || !edit.content.trim())
                return;
              const before = state.templates.find((t) => t.id === edit.id);
              commit(
                (s) => ({
                  ...s,
                  templates: before
                    ? s.templates.map((t) => (t.id === edit.id ? edit : t))
                    : [edit, ...s.templates],
                }),
                {
                  action: "Guardar plantilla",
                  entity: edit.name,
                  before: JSON.stringify(before ?? null),
                  after: JSON.stringify(edit),
                  reason: "Preparación de texto para revisión humana.",
                },
              );
              setEdit(null);
              setMessage("Plantilla guardada. No se envió ningún mensaje.");
            }}
          >
            <FormField
              id="template-name"
              label="Nombre de plantilla"
              required
              value={edit.name}
              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
            />
            <Select
              label="Canal previsto"
              value={edit.channel}
              onChange={(channel) => setEdit({ ...edit, channel })}
              options={["Web", "WhatsApp", "Instagram"]}
            />
            <TextArea
              label="Contenido"
              value={edit.content}
              onChange={(content) => setEdit({ ...edit, content })}
              required
            />
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={edit.enabled}
                onChange={(e) =>
                  setEdit({ ...edit, enabled: e.target.checked })
                }
              />
              Disponible para revisión humana
            </label>
            <FormActions
              onCancel={() => setEdit(null)}
              disabled={!edit.name.trim() || !edit.content.trim()}
            />
          </form>
        </Dialog>
      )}
      {preview && (
        <Dialog
          title={`Vista previa · ${preview.name}`}
          onClose={() => setPreview(null)}
        >
          <p>Canal previsto: {preview.channel}</p>
          <blockquote className={styles.card}>{preview.content}</blockquote>
          <Notice>
            Vista previa local. No se enviará a ningún destinatario.
          </Notice>
        </Dialog>
      )}
      {remove && (
        <Confirm
          title="Eliminar plantilla"
          description={`Se eliminará ${remove.name} de la sesión de demostración.`}
          onClose={() => setRemove(null)}
          onConfirm={(reason) => {
            commit(
              (s) => ({
                ...s,
                templates: s.templates.filter((t) => t.id !== remove.id),
              }),
              {
                action: "Eliminar plantilla",
                entity: remove.name,
                before: remove.content,
                after: "Eliminada",
                reason,
              },
            );
            setMessage("Plantilla eliminada.");
          }}
        />
      )}
    </Workspace>
  );
}
