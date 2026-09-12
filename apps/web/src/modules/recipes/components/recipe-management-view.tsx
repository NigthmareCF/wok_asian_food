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
  Workspace,
  createId,
  recipeError,
  styles,
  useAdminWorkspace,
  useList,
  type Recipe,
} from "@/modules/admin-workspace";
export function RecipeManagementView() {
  const { state, commit, canManage } = useAdminWorkspace();
  const [edit, setEdit] = useState<Recipe | null>(null);
  const [detail, setDetail] = useState<Recipe | null>(null);
  const [activate, setActivate] = useState<Recipe | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const rows = useList(
    "recipes",
    state.recipes,
    (r) => `${r.name} v${r.version}`,
    (r) => r.status,
  );
  function save() {
    if (!edit || !canManage) return;
    if (
      edit.version === 1 &&
      state.recipes.some(
        (r) =>
          r.id !== edit.id &&
          r.name.trim().toLowerCase() === edit.name.trim().toLowerCase(),
      )
    ) {
      setError(
        "Ya existe esta preparación. Crea una versión desde su historial.",
      );
      return;
    }
    const error = recipeError(edit, state.ingredients);
    if (error) {
      setError(error);
      return;
    }
    const before = state.recipes.find((r) => r.id === edit.id);
    commit(
      (s) => ({
        ...s,
        recipes: before
          ? s.recipes.map((r) => (r.id === edit.id ? edit : r))
          : [edit, ...s.recipes],
      }),
      {
        action: "Guardar borrador de receta",
        entity: `${edit.name} v${edit.version}`,
        before: JSON.stringify(before ?? null),
        after: JSON.stringify(edit),
        reason: "Edición de composición de demostración.",
      },
    );
    setEdit(null);
    setMessage("Borrador guardado. Las versiones anteriores se conservaron.");
  }
  return (
    <Workspace
      id="A-06"
      title="Recetas y versiones"
      description="Controla componentes, rendimiento e historial de cada preparación."
      actions={
        <Button
          disabled={!canManage}
          onClick={() => {
            setError("");
            setEdit({
              id: createId("recipe"),
              name: "",
              version: 1,
              status: "Borrador",
              yield: 1,
              effectiveDate: "2026-09-12",
              components: [],
            });
          }}
        >
          Nueva receta
        </Button>
      }
    >
      {message && <Notice>{message}</Notice>}
      <SearchFilter
        id="recipes"
        statuses={["Borrador", "Vigente", "Histórica"]}
      />
      <DataTable
        id="recipes"
        rows={rows}
        columns={[
          {
            label: "Preparación",
            render: (r) => (
              <>
                <strong>{r.name}</strong>
                <small>Versión {r.version}</small>
              </>
            ),
          },
          { label: "Rendimiento", render: (r) => `${r.yield} porciones` },
          { label: "Vigencia", render: (r) => r.effectiveDate },
          {
            label: "Estado",
            render: (r) => (
              <>
                <Badge>{r.status}</Badge>
                {recipeError(r, state.ingredients) && (
                  <Badge>Dependencia inválida</Badge>
                )}
              </>
            ),
          },
          {
            label: "Acciones",
            render: (r) => (
              <div className={styles.actions}>
                <Button variant="secondary" onClick={() => setDetail(r)}>
                  Ver versión
                </Button>
                <Button
                  variant="secondary"
                  disabled={!canManage}
                  onClick={() => {
                    setError("");
                    setEdit(
                      r.status === "Borrador"
                        ? structuredClone(r)
                        : {
                            ...structuredClone(r),
                            id: createId("recipe"),
                            version:
                              Math.max(
                                ...state.recipes
                                  .filter((x) => x.name === r.name)
                                  .map((x) => x.version),
                              ) + 1,
                            status: "Borrador",
                          },
                    );
                  }}
                >
                  {r.status === "Borrador"
                    ? "Editar borrador"
                    : "Crear versión"}
                </Button>
                {r.status === "Borrador" && (
                  <Button
                    variant="secondary"
                    disabled={!canManage || !!recipeError(r, state.ingredients)}
                    onClick={() => setActivate(r)}
                  >
                    Marcar vigente
                  </Button>
                )}
              </div>
            ),
          },
        ]}
      />
      {edit && (
        <Dialog
          title={`Receta · versión ${edit.version}`}
          onClose={() => setEdit(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            {error && <Notice error>{error}</Notice>}
            <FormField
              id="recipe-name"
              label="Nombre de preparación"
              required
              disabled={edit.version > 1}
              value={edit.name}
              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
            />
            <div className={styles.grid}>
              <FormField
                id="recipe-yield"
                label="Rendimiento (porciones)"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={Number.isFinite(edit.yield) ? edit.yield : ""}
                onChange={(e) =>
                  setEdit({ ...edit, yield: e.target.valueAsNumber })
                }
              />
              <FormField
                id="recipe-date"
                label="Fecha de vigencia"
                type="date"
                required
                value={edit.effectiveDate}
                onChange={(e) =>
                  setEdit({ ...edit, effectiveDate: e.target.value })
                }
              />
            </div>
            <h3>Componentes</h3>
            {edit.components.map((c, index) => (
              <div className={styles.toolbar} key={index}>
                <Select
                  label={`Ingrediente ${index + 1}`}
                  value={c.ingredientId}
                  onChange={(value) =>
                    setEdit({
                      ...edit,
                      components: edit.components.map((item, i) =>
                        i === index ? { ...item, ingredientId: value } : item,
                      ),
                    })
                  }
                  options={state.ingredients.map((i) => ({
                    value: i.id,
                    label: `${i.name} (${i.unit})`,
                  }))}
                />
                <FormField
                  id={`quantity-${index}`}
                  label={`Cantidad ${index + 1}`}
                  type="number"
                  min="0.001"
                  step="0.001"
                  required
                  value={Number.isFinite(c.quantity) ? c.quantity : ""}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      components: edit.components.map((item, i) =>
                        i === index
                          ? { ...item, quantity: e.target.valueAsNumber }
                          : item,
                      ),
                    })
                  }
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setEdit({
                      ...edit,
                      components: edit.components.filter((_, i) => i !== index),
                    })
                  }
                >
                  Quitar componente {index + 1}
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setEdit({
                  ...edit,
                  components: [
                    ...edit.components,
                    { ingredientId: state.ingredients[0].id, quantity: 1 },
                  ],
                })
              }
            >
              Agregar componente
            </Button>
            <FormActions
              onCancel={() => setEdit(null)}
              label="Guardar borrador"
            />
          </form>
        </Dialog>
      )}
      {detail && (
        <Dialog
          title={`${detail.name} · v${detail.version}`}
          onClose={() => setDetail(null)}
        >
          <Badge>{detail.status}</Badge>
          <p>
            Rendimiento: {detail.yield} porciones · Vigencia:{" "}
            {detail.effectiveDate}
          </p>
          <ul>
            {detail.components.map((c, i) => (
              <li key={i}>
                {state.ingredients.find((x) => x.id === c.ingredientId)?.name ??
                  "Ingrediente no encontrado"}
                : {c.quantity}{" "}
                {state.ingredients.find((x) => x.id === c.ingredientId)?.unit}
              </li>
            ))}
          </ul>
          {recipeError(detail, state.ingredients) && (
            <Notice error>{recipeError(detail, state.ingredients)}</Notice>
          )}
          <h3>Historial conservado</h3>
          <ul>
            {state.recipes
              .filter((r) => r.name === detail.name)
              .map((r) => (
                <li key={r.id}>
                  v{r.version} · {r.status} · {r.effectiveDate}
                </li>
              ))}
          </ul>
        </Dialog>
      )}
      {activate && (
        <Confirm
          title="Publicar versión de receta"
          description={`La versión ${activate.version} de ${activate.name} será vigente. La versión anterior quedará histórica.`}
          onClose={() => setActivate(null)}
          onConfirm={(reason) => {
            commit(
              (s) => ({
                ...s,
                recipes: s.recipes.map((r) =>
                  r.id === activate.id
                    ? { ...r, status: "Vigente" }
                    : r.name === activate.name && r.status === "Vigente"
                      ? { ...r, status: "Histórica" }
                      : r,
                ),
              }),
              {
                action: "Publicar receta",
                entity: activate.name,
                before: JSON.stringify(
                  state.recipes.filter((r) => r.name === activate.name),
                ),
                after: `Versión ${activate.version} vigente`,
                reason,
              },
            );
            setMessage("Versión publicada; historial conservado.");
          }}
        />
      )}
    </Workspace>
  );
}
