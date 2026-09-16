import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { navigation } from "@/config/navigation";
import { UserManagementView } from "./user-management-view";

afterEach(cleanup);

describe("UserManagementView", () => {
  it("searches users by name and email", async () => {
    const user = userEvent.setup();
    render(<UserManagementView />);

    await user.type(screen.getByRole("searchbox"), "Lucía");
    expect(
      screen.getByRole("row", { name: /Lucía Herrera/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Mariana López")).not.toBeInTheDocument();

    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "carlos.mendez");
    expect(
      screen.getByRole("row", { name: /Carlos Méndez/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Daniel Reyes")).not.toBeInTheDocument();
  });

  it("filters users by every visible status", async () => {
    const user = userEvent.setup();
    render(<UserManagementView />);

    await user.click(screen.getByRole("button", { name: "Activo" }));
    expect(
      screen.getByRole("row", { name: /Mariana López/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Carlos Méndez")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Suspendido" }));
    expect(
      screen.getByRole("row", { name: /Carlos Méndez/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Desactivado" }));
    expect(
      screen.getByRole("row", { name: /Daniel Reyes/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Acceso pendiente" }));
    expect(
      screen.getByRole("row", { name: /Lucía Herrera/ }),
    ).toBeInTheDocument();
  });

  it("shows empty, loading and error states", async () => {
    const user = userEvent.setup();
    render(<UserManagementView />);

    await user.type(screen.getByRole("searchbox"), "sin resultados");
    expect(screen.getByText("No encontramos usuarios")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Carga" }));
    expect(screen.getByText("Cargando usuarios")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Error" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No pudimos cargar usuarios",
    );

    await user.click(screen.getByRole("button", { name: "Vacío" }));
    expect(screen.getByText("No encontramos usuarios")).toBeInTheDocument();
  });

  it("creates and edits users with simulated audit records", async () => {
    const user = userEvent.setup();
    render(<UserManagementView />);

    await user.click(screen.getByRole("button", { name: "Crear usuario" }));
    const createDialog = screen.getByRole("dialog", {
      name: "Crear usuario",
    });
    await user.type(within(createDialog).getByLabelText("Nombre"), "Ana Demo");
    await user.type(
      within(createDialog).getByLabelText("Correo"),
      "ana.demo@wok.demo",
    );
    await user.click(
      within(createDialog).getByRole("button", { name: "Guardar" }),
    );

    expect(screen.getByRole("row", { name: /Ana Demo/ })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Usuario creado");
    expect(screen.getByLabelText("Bitácora simulada")).toHaveTextContent(
      "Creación",
    );

    const row = screen.getByRole("row", { name: /Ana Demo/ });
    await user.click(within(row).getByRole("button", { name: "Editar" }));
    const editDialog = screen.getByRole("dialog", { name: "Editar usuario" });
    await user.clear(within(editDialog).getByLabelText("Nombre"));
    await user.type(within(editDialog).getByLabelText("Nombre"), "Ana Editada");
    await user.click(
      within(editDialog).getByRole("checkbox", { name: /Auditoría demo/ }),
    );
    await user.click(
      within(editDialog).getByRole("button", { name: "Guardar" }),
    );

    expect(
      screen.getByRole("row", { name: /Ana Editada/ }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Bitácora simulada")).toHaveTextContent(
      "Edición",
    );
  });

  it("focuses the form, keeps the background inert and restores focus on cancel", async () => {
    const user = userEvent.setup();
    render(<UserManagementView />);

    const createButton = screen.getByRole("button", {
      name: "Crear usuario",
    });
    await user.click(createButton);

    const dialog = screen.getByRole("dialog", { name: "Crear usuario" });
    expect(within(dialog).getByLabelText("Nombre")).toHaveFocus();
    expect(
      screen.getByText("Canal administrativo").parentElement?.parentElement
        ?.parentElement,
    ).toHaveAttribute("inert");

    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(createButton).toHaveFocus());
  });

  it("closes the form with Escape without saving and restores focus", async () => {
    const user = userEvent.setup();
    render(<UserManagementView />);

    const createButton = screen.getByRole("button", {
      name: "Crear usuario",
    });
    await user.click(createButton);
    const dialog = screen.getByRole("dialog", { name: "Crear usuario" });
    await user.type(within(dialog).getByLabelText("Nombre"), "Sin Guardar");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Sin Guardar")).not.toBeInTheDocument();
    await waitFor(() => expect(createButton).toHaveFocus());
  });

  it("traps Tab and Shift+Tab inside the form dialog", async () => {
    const user = userEvent.setup();
    render(<UserManagementView />);

    await user.click(screen.getByRole("button", { name: "Crear usuario" }));
    const dialog = screen.getByRole("dialog", { name: "Crear usuario" });
    const closeButton = within(dialog).getByRole("button", {
      name: "Cerrar formulario",
    });
    const saveButton = within(dialog).getByRole("button", { name: "Guardar" });

    closeButton.focus();
    await user.tab({ shift: true });
    expect(saveButton).toHaveFocus();

    await user.tab();
    expect(closeButton).toHaveFocus();
  });

  it("allows saving an empty form and reports required name and email fields", async () => {
    const user = userEvent.setup();
    render(<UserManagementView />);

    await user.click(screen.getByRole("button", { name: "Crear usuario" }));
    const dialog = screen.getByRole("dialog", { name: "Crear usuario" });
    await user.click(within(dialog).getByRole("button", { name: "Guardar" }));

    const nameField = within(dialog).getByLabelText("Nombre");
    const emailField = within(dialog).getByLabelText("Correo");

    expect(
      within(dialog).getByText("El nombre es requerido."),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("El correo es requerido."),
    ).toBeInTheDocument();
    expect(nameField).toHaveAttribute("aria-invalid", "true");
    expect(emailField).toHaveAttribute("aria-invalid", "true");
    expect(nameField).toHaveAttribute(
      "aria-describedby",
      "admin-user-name-help",
    );
    expect(emailField).toHaveAttribute(
      "aria-describedby",
      "admin-user-email-help",
    );
    await waitFor(() => expect(nameField).toHaveFocus());
  });

  it("does not require roles when creating a user", async () => {
    const user = userEvent.setup();
    render(<UserManagementView />);

    await user.click(screen.getByRole("button", { name: "Crear usuario" }));
    const dialog = screen.getByRole("dialog", { name: "Crear usuario" });
    await user.type(within(dialog).getByLabelText("Nombre"), "Usuario Sin Rol");
    await user.type(
      within(dialog).getByLabelText("Correo"),
      "sin.rol@wok.demo",
    );
    await user.click(
      within(dialog).getByRole("checkbox", { name: /Administración demo/ }),
    );
    await user.click(within(dialog).getByRole("button", { name: "Guardar" }));

    expect(
      screen.getByRole("row", { name: /Usuario Sin Rol/ }),
    ).toBeInTheDocument();
  });

  it("shows multiple roles and deduplicated effective capabilities", async () => {
    render(<UserManagementView />);

    const detail = screen.getByLabelText("Detalle de roles");
    expect(within(detail).getByText("Administración demo")).toBeInTheDocument();
    expect(within(detail).getByText("Soporte demo")).toBeInTheDocument();

    const capabilities = within(detail).getByLabelText("Capacidades efectivas");
    expect(
      within(capabilities).getAllByText("Consultar usuarios"),
    ).toHaveLength(1);
    expect(
      within(capabilities).getAllByText("Consultar reportes"),
    ).toHaveLength(1);
    expect(
      within(capabilities).getByText("Consultar roles asignados"),
    ).toBeInTheDocument();
  });

  it("activates and suspends users with confirmation and optional reason", async () => {
    const user = userEvent.setup();
    render(<UserManagementView />);

    const suspendedRow = screen.getByRole("row", { name: /Carlos Méndez/ });
    await user.click(
      within(suspendedRow).getByRole("button", { name: "Activar" }),
    );
    let dialog = screen.getByRole("dialog", { name: "Activar usuario" });
    await user.type(
      within(dialog).getByLabelText("Motivo opcional"),
      "Revisión simulada",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Confirmar activación" }),
    );

    expect(screen.getByRole("status")).toHaveTextContent("Usuario activado");
    expect(screen.getByLabelText("Bitácora simulada")).toHaveTextContent(
      "Motivo: Revisión simulada",
    );

    const activeRow = screen.getByRole("row", { name: /Mariana López/ });
    await user.click(
      within(activeRow).getByRole("button", { name: "Suspender" }),
    );
    dialog = screen.getByRole("dialog", { name: "Suspender usuario" });
    await user.click(
      within(dialog).getByRole("button", { name: "Confirmar suspensión" }),
    );

    expect(screen.getByRole("status")).toHaveTextContent("Usuario suspendido");
    expect(screen.getByLabelText("Bitácora simulada")).toHaveTextContent(
      "Suspensión",
    );
  });

  it("focuses confirmation cancel, closes with Escape and restores action focus", async () => {
    const user = userEvent.setup();
    render(<UserManagementView />);

    const row = screen.getByRole("row", { name: /Mariana López/ });
    const suspendButton = within(row).getByRole("button", {
      name: "Suspender",
    });
    await user.click(suspendButton);
    const dialog = screen.getByRole("dialog", { name: "Suspender usuario" });

    expect(
      within(dialog).getByRole("button", { name: "Cancelar" }),
    ).toHaveFocus();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("row", { name: /Mariana López/ }),
    ).toHaveTextContent("Activo");
    await waitFor(() => expect(suspendButton).toHaveFocus());
  });

  it("traps Tab and Shift+Tab inside the confirmation dialog", async () => {
    const user = userEvent.setup();
    render(<UserManagementView />);

    const row = screen.getByRole("row", { name: /Mariana López/ });
    await user.click(within(row).getByRole("button", { name: "Suspender" }));
    const dialog = screen.getByRole("dialog", { name: "Suspender usuario" });
    const closeButton = within(dialog).getByRole("button", {
      name: "Cerrar confirmación",
    });
    const confirmButton = within(dialog).getByRole("button", {
      name: "Confirmar suspensión",
    });

    closeButton.focus();
    await user.tab({ shift: true });
    expect(confirmButton).toHaveFocus();

    await user.tab();
    expect(closeButton).toHaveFocus();
  });

  it("cancels a confirmation without changing the user", async () => {
    const user = userEvent.setup();
    render(<UserManagementView />);

    const row = screen.getByRole("row", { name: /Mariana López/ });
    await user.click(within(row).getByRole("button", { name: "Suspender" }));
    const dialog = screen.getByRole("dialog", { name: "Suspender usuario" });
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("row", { name: /Mariana López/ }),
    ).toHaveTextContent("Activo");
  });

  it("keeps forms, role detail and confirmations accessible", async () => {
    const user = userEvent.setup();
    render(<UserManagementView />);

    const detailsButton = screen.getByRole("button", { name: /Mariana López/ });
    expect(detailsButton).toHaveAttribute(
      "aria-controls",
      "admin-user-role-detail",
    );
    expect(detailsButton).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("button", { name: "Crear usuario" }));
    const form = screen.getByRole("dialog", { name: "Crear usuario" });
    expect(within(form).getByLabelText("Nombre")).toBeInTheDocument();
    expect(within(form).getByLabelText("Correo")).toBeInTheDocument();
    await user.click(within(form).getByRole("button", { name: "Cancelar" }));

    const row = screen.getByRole("row", { name: /Mariana López/ });
    await user.click(within(row).getByRole("button", { name: "Suspender" }));
    const confirmation = screen.getByRole("dialog", {
      name: "Suspender usuario",
    });
    expect(
      within(confirmation).getByLabelText("Motivo opcional"),
    ).toBeInTheDocument();
  });

  it("enables the existing admin users navigation entry", () => {
    const usersEntry = navigation.admin.find(
      (item) => item.route === "/admin/users",
    );

    expect(usersEntry).toMatchObject({
      icon: "people",
      label: "Usuarios",
      requiredPermission: "users.read",
      route: "/admin/users",
    });
    expect(usersEntry).not.toHaveProperty("featureFlag", false);
  });
});
