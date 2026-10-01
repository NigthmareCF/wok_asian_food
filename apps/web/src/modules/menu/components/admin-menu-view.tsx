"use client";
import { useState } from "react";
import Image from "next/image";
import {
  Badge,
  Button,
  Confirm,
  Dialog,
  FormActions,
  FormField,
  Notice,
  SearchFilter,
  Select,
  TextArea,
  Workspace,
  createId,
  money,
  styles,
  useAdminFilter,
  useAdminWorkspace,
  useList,
  type Dish,
  type Category,
  type DishStatus,
} from "@/modules/admin-workspace";
const statuses: DishStatus[] = [
  "Publicado",
  "Borrador",
  "No disponible",
  "Restringido",
];
export function AdminMenuView() {
  const { state, commit, canManage } = useAdminWorkspace();
  const [category, setCategory] = useAdminFilter("menu.category", "all");
  const [edit, setEdit] = useState<Dish | null>(null);
  const [categoryEdit, setCategoryEdit] = useState<Category | null>(null);
  const [pending, setPending] = useState<{
    title: string;
    description: string;
    run: (reason: string) => void;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const dishes = useList(
    "menu",
    state.dishes,
    (d) => d.name,
    (d) => d.status,
  ).filter((d) => category === "all" || d.categoryId === category);
  function saveDish() {
    if (!edit || !canManage) return;
    if (
      !edit.name.trim() ||
      !Number.isFinite(edit.price) ||
      edit.price < 0 ||
      !state.categories.some((c) => c.id === edit.categoryId)
    ) {
      setError(
        "Completa el nombre, una categoría válida y un precio no negativo.",
      );
      return;
    }
    const saved = { ...edit, name: edit.name.trim() };
    const before = state.dishes.find((d) => d.id === saved.id);
    commit(
      (s) => ({
        ...s,
        dishes: before
          ? s.dishes.map((d) => (d.id === saved.id ? saved : d))
          : [saved, ...s.dishes],
      }),
      {
        action: before ? "Editar platillo" : "Crear platillo",
        entity: saved.name,
        before: JSON.stringify(
          before
            ? { ...before, image: before.image ? "Imagen configurada" : "" }
            : null,
        ),
        after: JSON.stringify({
          ...saved,
          image: saved.image ? "Imagen configurada" : "",
        }),
        reason: "Edición manual del catálogo de demostración.",
      },
    );
    setEdit(null);
    setMessage("Platillo guardado en esta sesión.");
  }
  function removeDish(dish: Dish) {
    setPending({
      title: "Eliminar platillo",
      description: `Se retirará ${dish.name} del catálogo de demostración.`,
      run: (reason) => {
        commit(
          (s) => ({ ...s, dishes: s.dishes.filter((d) => d.id !== dish.id) }),
          {
            action: "Eliminar platillo",
            entity: dish.name,
            before: JSON.stringify({ ...dish, image: !!dish.image }),
            after: "Eliminado",
            reason,
          },
        );
        setMessage("Platillo eliminado.");
      },
    });
  }
  return (
    <Workspace
      id="A-05"
      title="Menú y categorías"
      description="Administra platillos, opciones y visibilidad del catálogo."
      actions={
        <Button
          disabled={!canManage || !state.categories.length}
          onClick={() => {
            setError("");
            setEdit({
              id: createId("dish"),
              name: "",
              categoryId:
                category === "all" ? state.categories[0].id : category,
              price: 0,
              description: "",
              image: "",
              options: [],
              status: "Borrador",
            });
          }}
        >
          Agregar platillo
        </Button>
      }
    >
      {message && <Notice>{message}</Notice>}
      <div className={styles.split}>
        <aside className={styles.card}>
          <h2>Categorías</h2>
          <div className={styles.categories}>
            <Button
              variant="secondary"
              className={category === "all" ? styles.selected : ""}
              onClick={() => setCategory("all")}
            >
              Todas ({state.dishes.length})
            </Button>
            {state.categories.map((c) => (
              <div key={c.id}>
                <Button
                  variant="secondary"
                  className={category === c.id ? styles.selected : ""}
                  onClick={() => setCategory(c.id)}
                >
                  {c.name} (
                  {state.dishes.filter((d) => d.categoryId === c.id).length})
                </Button>
                {category === c.id && (
                  <div className={styles.actions}>
                    <Button
                      variant="secondary"
                      disabled={!canManage}
                      onClick={() => {
                        setError("");
                        setCategoryEdit({ ...c });
                      }}
                    >
                      Editar categoría
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={
                        !canManage ||
                        state.dishes.some((d) => d.categoryId === c.id)
                      }
                      title="Solo se eliminan categorías sin platillos"
                      onClick={() =>
                        setPending({
                          title: "Eliminar categoría",
                          description: `Se eliminará ${c.name}, que no tiene platillos asociados.`,
                          run: (reason) => {
                            commit(
                              (s) => ({
                                ...s,
                                categories: s.categories.filter(
                                  (item) => item.id !== c.id,
                                ),
                              }),
                              {
                                action: "Eliminar categoría",
                                entity: c.name,
                                before: c.name,
                                after: "Eliminada",
                                reason,
                              },
                            );
                            setCategory("all");
                          },
                        })
                      }
                    >
                      Eliminar categoría
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <Button
            variant="secondary"
            disabled={!canManage}
            onClick={() => {
              setError("");
              setCategoryEdit({ id: createId("cat"), name: "" });
            }}
          >
            Nueva categoría
          </Button>
        </aside>
        <div className={styles.stack}>
          <SearchFilter id="menu" statuses={statuses} />
          <div className={styles.grid}>
            {dishes.map((d) => (
              <article className={`${styles.card} ${styles.dish}`} key={d.id}>
                {d.image && (
                  <Image
                    src={d.image}
                    alt={d.name}
                    width={100}
                    height={100}
                    unoptimized
                  />
                )}
                <div>
                  <div className={styles.header}>
                    <h3>{d.name}</h3>
                    <span className={styles.price}>{money(d.price)}</span>
                  </div>
                  <Badge>{d.status}</Badge>
                  <p>{d.description}</p>
                  <small>
                    {d.options.length
                      ? d.options.join(" · ")
                      : "Sin opciones adicionales"}
                  </small>
                  <div className={styles.actions}>
                    <Button
                      variant="secondary"
                      disabled={!canManage}
                      onClick={() => {
                        setError("");
                        setEdit({ ...d, options: [...d.options] });
                      }}
                    >
                      Editar {d.name}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={!canManage}
                      onClick={() => removeDish(d)}
                    >
                      Eliminar
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {!dishes.length && (
            <div className={styles.empty} role="status">
              No hay platillos con estos filtros.
            </div>
          )}
        </div>
      </div>
      {edit && (
        <Dialog
          title={
            state.dishes.some((d) => d.id === edit.id)
              ? "Editar platillo"
              : "Nuevo platillo"
          }
          onClose={() => setEdit(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveDish();
            }}
          >
            {error && <Notice error>{error}</Notice>}
            <FormField
              id="dish-name"
              label="Nombre"
              required
              value={edit.name}
              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
            />
            <div className={styles.grid}>
              <Select
                label="Categoría"
                value={edit.categoryId}
                onChange={(value) => setEdit({ ...edit, categoryId: value })}
                options={state.categories.map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
              />
              <FormField
                id="dish-price"
                label="Precio (Q)"
                type="number"
                min="0"
                step="0.01"
                required
                value={Number.isFinite(edit.price) ? edit.price : ""}
                onChange={(e) =>
                  setEdit({ ...edit, price: e.target.valueAsNumber })
                }
              />
            </div>
            <TextArea
              label="Descripción"
              value={edit.description}
              onChange={(value) => setEdit({ ...edit, description: value })}
            />
            <Select
              label="Visibilidad"
              value={edit.status}
              onChange={(value) =>
                setEdit({ ...edit, status: value as DishStatus })
              }
              options={statuses}
            />
            <TextArea
              label="Opciones (una por línea)"
              value={edit.options.join("\n")}
              onChange={(value) =>
                setEdit({ ...edit, options: value.split("\n") })
              }
            />
            <FormField
              id="dish-photo"
              label="Fotografía (PNG, JPEG o WebP; máximo 2 MB)"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (
                  !["image/png", "image/jpeg", "image/webp"].includes(
                    file.type,
                  ) ||
                  file.size > 2 * 1024 * 1024
                ) {
                  setError("Usa una imagen PNG, JPEG o WebP de hasta 2 MB.");
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                  const image = String(reader.result);
                  setEdit((current) =>
                    current && current.id === edit.id
                      ? { ...current, image }
                      : current,
                  );
                };
                reader.readAsDataURL(file);
              }}
            />
            {edit.image && (
              <>
                <Image
                  src={edit.image}
                  alt="Vista previa"
                  width={100}
                  height={100}
                  unoptimized
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setEdit({ ...edit, image: "" })}
                >
                  Quitar fotografía
                </Button>
              </>
            )}
            <FormActions onCancel={() => setEdit(null)} />
          </form>
        </Dialog>
      )}
      {categoryEdit && (
        <Dialog title="Guardar categoría" onClose={() => setCategoryEdit(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!canManage) return;
              const name = categoryEdit.name.trim();
              if (
                !name ||
                state.categories.some(
                  (c) =>
                    c.id !== categoryEdit.id &&
                    c.name.toLowerCase() === name.toLowerCase(),
                )
              ) {
                setError("Usa un nombre de categoría único.");
                return;
              }
              commit(
                (s) => ({
                  ...s,
                  categories: s.categories.some((c) => c.id === categoryEdit.id)
                    ? s.categories.map((c) =>
                        c.id === categoryEdit.id
                          ? { ...categoryEdit, name }
                          : c,
                      )
                    : [...s.categories, { ...categoryEdit, name }],
                }),
                {
                  action: "Guardar categoría",
                  entity: name,
                  before:
                    state.categories.find((c) => c.id === categoryEdit.id)
                      ?.name ?? "Nueva",
                  after: name,
                  reason: "Organización del catálogo.",
                },
              );
              setCategoryEdit(null);
              setMessage("Categoría guardada.");
            }}
          >
            {error && <Notice error>{error}</Notice>}
            <FormField
              id="category-name"
              label="Nombre de categoría"
              required
              value={categoryEdit.name}
              onChange={(e) =>
                setCategoryEdit({ ...categoryEdit, name: e.target.value })
              }
            />
            <FormActions onCancel={() => setCategoryEdit(null)} />
          </form>
        </Dialog>
      )}
      {pending && (
        <Confirm
          {...pending}
          onConfirm={pending.run}
          onClose={() => setPending(null)}
        />
      )}
    </Workspace>
  );
}
