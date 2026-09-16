import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RolesPermissionsView } from "./roles-permissions-view";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
});

async function saveAndWait(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Guardar cambios/ }));
  expect(screen.getByText("Guardando cambios simulados.")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /Guardar cambios/ }),
  ).toBeDisabled();
  await waitFor(() =>
    expect(
      screen.queryByText("Guardando cambios simulados."),
    ).not.toBeInTheDocument(),
  );
}

describe("RolesPermissionsView", () => {
  it("shows a perceptible error when saving an empty role name", async () => {
    const user = userEvent.setup();
    render(<RolesPermissionsView />);

    await user.click(screen.getByRole("button", { name: "Crear rol" }));
    const dialog = screen.getByRole("dialog", { name: "Crear rol" });
    await user.type(within(dialog).getByLabelText("Nombre del rol"), "   ");
    await user.click(
      within(dialog).getByRole("button", { name: /Guardar cambios/ }),
    );

    const nameField = within(dialog).getByLabelText("Nombre del rol");
    expect(
      within(dialog).getByText("El nombre del rol es requerido."),
    ).toBeInTheDocument();
    expect(nameField).toHaveAttribute("aria-invalid", "true");
    expect(nameField).toHaveAttribute(
      "aria-describedby",
      "admin-role-name-error",
    );
    await waitFor(() => expect(nameField).toHaveFocus());
  });

  it("creates a role with simulated audit records", async () => {
    const user = userEvent.setup();
    render(<RolesPermissionsView />);

    await user.click(screen.getByRole("button", { name: "Crear rol" }));
    const dialog = screen.getByRole("dialog", { name: "Crear rol" });
    await user.type(
      within(dialog).getByLabelText("Nombre del rol"),
      "Coordinación demo",
    );
    await user.click(
      within(dialog).getByRole("checkbox", { name: "Consultar roles" }),
    );
    await saveAndWait(user);

    expect(
      screen.getByRole("button", { name: /Coordinación demo/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Rol creado");
    expect(screen.getByLabelText("Bitácora simulada")).toHaveTextContent(
      "Creación",
    );
  });

  it("edits the role name and returns to unchanged after saving", async () => {
    const user = userEvent.setup();
    render(<RolesPermissionsView />);

    await user.click(screen.getByRole("button", { name: "Editar rol" }));
    const dialog = screen.getByRole("dialog", { name: "Editar rol" });
    const nameField = within(dialog).getByLabelText("Nombre del rol");
    await user.clear(nameField);
    await user.type(nameField, "Administración ajustada");

    expect(
      screen.getByRole("button", { hidden: true, name: "Cambios pendientes" }),
    ).toHaveAttribute("aria-pressed", "true");

    await saveAndWait(user);

    expect(
      screen.getByRole("button", { name: /Administración ajustada/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sin cambios" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByLabelText("Bitácora simulada")).toHaveTextContent(
      "Actualización",
    );
  });

  it("marks and unmarks permissions without changing effective permissions before save", async () => {
    const user = userEvent.setup();
    render(<RolesPermissionsView />);

    expect(screen.getAllByText("Editar usuarios")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Editar rol" }));
    const dialog = screen.getByRole("dialog", { name: "Editar rol" });
    expect(screen.getAllByText("Editar usuarios")).toHaveLength(2);
    await user.click(
      within(dialog).getByRole("checkbox", { name: "Editar usuarios" }),
    );
    await user.click(
      within(dialog).getByRole("checkbox", { name: "Consultar bitácora" }),
    );

    expect(
      screen.getByRole("button", { hidden: true, name: "Cambios pendientes" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText("Editar usuarios")).toHaveLength(2);

    await saveAndWait(user);

    const effectivePermissions = screen.getByLabelText("Permisos efectivos");
    expect(
      within(effectivePermissions).queryByText("Editar usuarios"),
    ).not.toBeInTheDocument();
    expect(
      within(effectivePermissions).getByText("Consultar bitácora"),
    ).toBeInTheDocument();
  });

  it("shows conflict as a perceptible simulated state", async () => {
    const user = userEvent.setup();
    render(<RolesPermissionsView />);

    await user.click(screen.getByRole("button", { name: "Conflicto" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Conflicto simulado");
    expect(screen.getByRole("button", { name: "Conflicto" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("asks confirmation before discarding changes", async () => {
    const user = userEvent.setup();
    render(<RolesPermissionsView />);

    await user.click(screen.getByRole("button", { name: "Editar rol" }));
    let dialog = screen.getByRole("dialog", { name: "Editar rol" });
    await user.type(
      within(dialog).getByLabelText("Nombre del rol"),
      " temporal",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Descartar cambios" }),
    );

    const confirmation = screen.getByRole("dialog", {
      name: "Descartar cambios",
    });
    await user.click(
      within(confirmation).getByRole("button", { name: "Cancelar" }),
    );

    dialog = screen.getByRole("dialog", { name: "Editar rol" });
    expect(within(dialog).getByLabelText("Nombre del rol")).toHaveValue(
      "Administración demo temporal",
    );

    await user.click(
      within(dialog).getByRole("button", { name: "Descartar cambios" }),
    );
    await user.click(
      within(
        screen.getByRole("dialog", { name: "Descartar cambios" }),
      ).getByRole("button", { name: "Descartar cambios" }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Administración demo/ }),
    ).toBeInTheDocument();
  });

  it("opens discard confirmation with Escape or close when dirty", async () => {
    const user = userEvent.setup();
    render(<RolesPermissionsView />);

    await user.click(screen.getByRole("button", { name: "Editar rol" }));
    let dialog = screen.getByRole("dialog", { name: "Editar rol" });
    await user.type(
      within(dialog).getByLabelText("Nombre del rol"),
      " temporal",
    );
    await user.keyboard("{Escape}");

    let confirmation = screen.getByRole("dialog", {
      name: "Descartar cambios",
    });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await user.click(
      within(confirmation).getByRole("button", { name: "Cancelar" }),
    );

    dialog = screen.getByRole("dialog", { name: "Editar rol" });
    expect(within(dialog).getByLabelText("Nombre del rol")).toHaveValue(
      "Administración demo temporal",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Cerrar formulario" }),
    );

    confirmation = screen.getByRole("dialog", {
      name: "Descartar cambios",
    });
    await user.click(
      within(confirmation).getByRole("button", {
        name: "Descartar cambios",
      }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Administración demo/ }),
    ).toBeInTheDocument();
  });

  it("registers beforeunload only while dirty and removes it after saving", async () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const user = userEvent.setup();
    render(<RolesPermissionsView />);

    expect(
      addSpy.mock.calls.some(([eventName]) => eventName === "beforeunload"),
    ).toBe(false);

    await user.click(screen.getByRole("button", { name: "Editar rol" }));
    const dialog = screen.getByRole("dialog", { name: "Editar rol" });
    await user.type(
      within(dialog).getByLabelText("Nombre del rol"),
      " temporal",
    );

    expect(
      addSpy.mock.calls.some(([eventName]) => eventName === "beforeunload"),
    ).toBe(true);

    await saveAndWait(user);

    expect(
      removeSpy.mock.calls.some(([eventName]) => eventName === "beforeunload"),
    ).toBe(true);
  });

  it("removes beforeunload after confirmed discard", async () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const user = userEvent.setup();
    render(<RolesPermissionsView />);

    await user.click(screen.getByRole("button", { name: "Editar rol" }));
    const dialog = screen.getByRole("dialog", { name: "Editar rol" });
    await user.type(
      within(dialog).getByLabelText("Nombre del rol"),
      " temporal",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Descartar cambios" }),
    );
    await user.click(
      within(
        screen.getByRole("dialog", { name: "Descartar cambios" }),
      ).getByRole("button", { name: "Descartar cambios" }),
    );

    expect(
      removeSpy.mock.calls.some(([eventName]) => eventName === "beforeunload"),
    ).toBe(true);
  });

  it("keeps forms, checkboxes and dialogs accessible", async () => {
    const user = userEvent.setup();
    render(<RolesPermissionsView />);

    const createButton = screen.getByRole("button", { name: "Crear rol" });
    await user.click(createButton);
    const dialog = screen.getByRole("dialog", { name: "Crear rol" });
    const nameField = within(dialog).getByLabelText("Nombre del rol");
    expect(nameField).toHaveFocus();
    expect(
      within(dialog).getByText(/No hay cambios pendientes/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Canal administrativo").parentElement?.parentElement
        ?.parentElement,
    ).toHaveAttribute("inert");
    expect(
      within(dialog).getByRole("checkbox", { name: "Consultar usuarios" }),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(createButton).toHaveFocus());

    await user.click(screen.getByRole("button", { name: "Editar rol" }));
    const editDialog = screen.getByRole("dialog", { name: "Editar rol" });
    const closeButton = within(editDialog).getByRole("button", {
      name: "Cerrar formulario",
    });
    const saveButton = within(editDialog).getByRole("button", {
      name: /Guardar cambios/,
    });

    closeButton.focus();
    await user.tab({ shift: true });
    expect(saveButton).toHaveFocus();
    await user.tab();
    expect(closeButton).toHaveFocus();
  });
});
