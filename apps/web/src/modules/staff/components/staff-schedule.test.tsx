import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StaffScheduleView } from "./staff-schedule-view";

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

async function saveAndWait(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Guardar cambios/ }));
  expect(screen.getByRole("status")).toHaveTextContent(
    "Guardando cambios simulados.",
  );
  expect(
    screen.getByRole("button", { name: /Guardando|Guardar cambios/ }),
  ).toBeDisabled();
  await waitFor(() =>
    expect(screen.getByRole("status")).not.toHaveTextContent(
      "Guardando cambios simulados.",
    ),
  );
}

describe("StaffScheduleView", () => {
  it("renders staff navigation without blocked function references", () => {
    render(<StaffScheduleView />);
    const blockedTerm = ["aux", "iliar"].join("");

    expect(
      screen.getByRole("heading", { name: "Personal y horarios semanales" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("7 al 13 de septiembre de 2026"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Ana Rodriguez/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.queryByText(new RegExp(blockedTerm, "i")),
    ).not.toBeInTheDocument();
  });

  it("searches and selects staff", async () => {
    const user = userEvent.setup();
    render(<StaffScheduleView />);

    await user.type(screen.getByLabelText("Buscar personal"), "Carlos");

    expect(
      screen.queryByRole("button", { name: /Ana Rodriguez/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Carlos Mendez/ }));

    expect(
      screen.getByRole("heading", { name: "Carlos Mendez" }),
    ).toBeInTheDocument();
  });

  it("changes week and shows regular and special shifts", async () => {
    const user = userEvent.setup();
    render(<StaffScheduleView />);

    expect(screen.getByText("16:00 - 20:00")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Semana siguiente/ }));

    expect(
      screen.getByText("14 al 20 de septiembre de 2026"),
    ).toBeInTheDocument();
    expect(screen.getByText("09:00 - 14:00")).toBeInTheDocument();
    expect(screen.queryByText("16:00 - 20:00")).not.toBeInTheDocument();
  });

  it("edits a schedule with a draft before saving", async () => {
    const user = userEvent.setup();
    render(<StaffScheduleView />);

    await user.click(
      screen.getAllByRole("button", { name: "Editar horario" })[0],
    );
    const dialog = screen.getByRole("dialog", { name: "Editar horario" });
    const startTime = within(dialog).getByLabelText("Hora de inicio");

    await user.clear(startTime);
    await user.type(startTime, "08:30");

    expect(screen.getByText("Cambio pendiente")).toBeInTheDocument();
    expect(screen.queryByText("08:30 - 14:00")).not.toBeInTheDocument();

    await saveAndWait(user);

    expect(screen.getByText("08:30 - 14:00")).toBeInTheDocument();
    expect(screen.getByText("Sin cambios")).toBeInTheDocument();
    expect(screen.getByLabelText("Bitacora simulada")).toHaveTextContent(
      "Horario editado",
    );
  });

  it("creates and edits a special shift", async () => {
    const user = userEvent.setup();
    render(<StaffScheduleView />);

    await user.click(
      screen.getAllByRole("button", { name: "Turno especial" })[0],
    );
    let dialog = screen.getByRole("dialog", {
      name: "Registrar turno especial",
    });
    await user.type(within(dialog).getByLabelText("Hora de inicio"), "18:00");
    await user.type(
      within(dialog).getByLabelText("Hora de finalizacion"),
      "22:00",
    );
    await saveAndWait(user);

    expect(screen.getByText("18:00 - 22:00")).toBeInTheDocument();
    expect(screen.getByLabelText("Bitacora simulada")).toHaveTextContent(
      "Turno especial",
    );

    await user.click(
      screen.getAllByRole("button", { name: "Editar turno especial" })[0],
    );
    dialog = screen.getByRole("dialog", { name: "Editar turno especial" });
    const endTime = within(dialog).getByLabelText("Hora de finalizacion");
    await user.clear(endTime);
    await user.type(endTime, "23:00");
    await saveAndWait(user);

    expect(screen.getByText(/23:00/)).toBeInTheDocument();
    expect(screen.getByLabelText("Bitacora simulada")).toHaveTextContent(
      "Turno especial editado",
    );
  });

  it("registers absence only for the selected date", async () => {
    const user = userEvent.setup();
    render(<StaffScheduleView />);

    await user.click(
      screen.getAllByRole("button", { name: "Registrar ausencia" })[0],
    );
    const dialog = screen.getByRole("dialog", { name: "Registrar ausencia" });
    await user.type(
      within(dialog).getByLabelText("Motivo opcional simulado"),
      "Ausencia demo",
    );
    await saveAndWait(user);

    expect(
      screen.getByText("Ausencia simulada: Ausencia demo"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Bitacora simulada")).toHaveTextContent(
      "Ausencia",
    );
    expect(
      screen.getByRole("heading", { name: "Ana Rodriguez" }),
    ).toBeInTheDocument();
  });

  it("confirms discard and preserves draft when canceled", async () => {
    const user = userEvent.setup();
    render(<StaffScheduleView />);

    await user.click(
      screen.getAllByRole("button", { name: "Editar horario" })[0],
    );
    let dialog = screen.getByRole("dialog", { name: "Editar horario" });
    await user.clear(within(dialog).getByLabelText("Hora de inicio"));
    await user.type(within(dialog).getByLabelText("Hora de inicio"), "08:45");
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    let confirmation = screen.getByRole("dialog", {
      name: "Descartar cambios",
    });
    await user.click(
      within(confirmation).getByRole("button", { name: "Cancelar" }),
    );

    dialog = screen.getByRole("dialog", { name: "Editar horario" });
    expect(within(dialog).getByLabelText("Hora de inicio")).toHaveValue(
      "08:45",
    );

    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    confirmation = screen.getByRole("dialog", { name: "Descartar cambios" });
    await user.click(
      within(confirmation).getByRole("button", { name: "Descartar cambios" }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("08:45 - 14:00")).not.toBeInTheDocument();
  });

  it("protects person and week changes while dirty", async () => {
    const user = userEvent.setup();
    render(<StaffScheduleView />);

    await user.click(
      screen.getAllByRole("button", { name: "Editar horario" })[0],
    );
    const dialog = screen.getByRole("dialog", { name: "Editar horario" });
    await user.clear(within(dialog).getByLabelText("Hora de inicio"));
    await user.type(within(dialog).getByLabelText("Hora de inicio"), "08:15");

    expect(screen.getByText("Cambio pendiente")).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Editar horario" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { hidden: true, name: /Carlos Mendez/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Carlos Mendez/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Semana siguiente/ }),
    ).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(
      screen.getByRole("dialog", { name: "Descartar cambios" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(
      screen.getByRole("heading", { hidden: true, name: "Ana Rodriguez" }),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await user.click(screen.getByRole("button", { name: "Descartar cambios" }));
    await user.click(screen.getByRole("button", { name: /Semana siguiente/ }));
    expect(
      screen.getByText("14 al 20 de septiembre de 2026"),
    ).toBeInTheDocument();
  });

  it("registers beforeunload only while dirty and clears it after saving", async () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const user = userEvent.setup();
    render(<StaffScheduleView />);

    expect(
      addSpy.mock.calls.some(([eventName]) => eventName === "beforeunload"),
    ).toBe(false);

    await user.click(
      screen.getAllByRole("button", { name: "Editar horario" })[0],
    );
    const dialog = screen.getByRole("dialog", { name: "Editar horario" });
    await user.clear(within(dialog).getByLabelText("Hora de inicio"));
    await user.type(within(dialog).getByLabelText("Hora de inicio"), "08:05");

    expect(
      addSpy.mock.calls.some(([eventName]) => eventName === "beforeunload"),
    ).toBe(true);
    const beforeUnloadListener = addSpy.mock.calls.find(
      ([eventName]) => eventName === "beforeunload",
    )?.[1] as (event: BeforeUnloadEvent) => void;
    const beforeUnloadEvent = {
      preventDefault: vi.fn(),
      returnValue: undefined,
    } as unknown as BeforeUnloadEvent;

    beforeUnloadListener(beforeUnloadEvent);

    expect(beforeUnloadEvent.preventDefault).toHaveBeenCalled();
    expect(beforeUnloadEvent.returnValue).toBe("");

    await saveAndWait(user);

    expect(
      removeSpy.mock.calls.some(([eventName]) => eventName === "beforeunload"),
    ).toBe(true);
  });

  it("removes beforeunload after discarding pending changes", async () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const user = userEvent.setup();
    render(<StaffScheduleView />);

    await user.click(
      screen.getAllByRole("button", { name: "Editar horario" })[0],
    );
    const dialog = screen.getByRole("dialog", { name: "Editar horario" });
    await user.clear(within(dialog).getByLabelText("Hora de inicio"));
    await user.type(within(dialog).getByLabelText("Hora de inicio"), "08:05");
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await user.click(screen.getByRole("button", { name: "Descartar cambios" }));

    expect(
      removeSpy.mock.calls.some(([eventName]) => eventName === "beforeunload"),
    ).toBe(true);
  });

  it("validates required fields and focuses the first invalid field", async () => {
    const user = userEvent.setup();
    render(<StaffScheduleView />);

    await user.click(
      screen.getAllByRole("button", { name: "Turno especial" })[0],
    );
    const dialog = screen.getByRole("dialog", {
      name: "Registrar turno especial",
    });
    const dateField = within(dialog).getByLabelText("Fecha");
    await user.clear(dateField);
    await user.click(
      within(dialog).getByRole("button", { name: "Guardar cambios" }),
    );

    expect(
      within(dialog).getByText("La fecha es requerida."),
    ).toBeInTheDocument();
    expect(dateField).toHaveAttribute("aria-invalid", "true");
    expect(dateField).toHaveAttribute("aria-describedby", "staff-date-error");
    await waitFor(() => expect(dateField).toHaveFocus());
  });

  it("handles focus, Escape, focus trap and restoration", async () => {
    const user = userEvent.setup();
    render(<StaffScheduleView />);

    const opener = screen.getAllByRole("button", { name: "Editar horario" })[0];
    await user.click(opener);
    let dialog = screen.getByRole("dialog", { name: "Editar horario" });
    await waitFor(() =>
      expect(within(dialog).getByLabelText("Fecha")).toHaveFocus(),
    );

    await user.tab({ shift: true });
    expect(
      within(dialog).getByRole("button", { name: "Cerrar formulario" }),
    ).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());

    await user.click(opener);
    dialog = screen.getByRole("dialog", { name: "Editar horario" });
    await user.clear(within(dialog).getByLabelText("Hora de inicio"));
    await user.type(within(dialog).getByLabelText("Hora de inicio"), "08:25");
    await user.keyboard("{Escape}");

    const confirmation = screen.getByRole("dialog", {
      name: "Descartar cambios",
    });
    await waitFor(() =>
      expect(
        within(confirmation).getByRole("button", { name: "Cancelar" }),
      ).toHaveFocus(),
    );
  });
});
