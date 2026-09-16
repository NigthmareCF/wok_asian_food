import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AdminWorkspaceProvider, useAdminWorkspace } from "./session";
import { AdminMenuView } from "@/modules/menu";
import { RecipeManagementView } from "@/modules/recipes";
import { SupplierManagementView } from "@/modules/suppliers";
import { PurchaseManagementView } from "@/modules/purchases";
import { ProductionPlanView } from "@/modules/production";
import { AdminReportsView } from "@/modules/reports";
import { CashClosingsView } from "@/modules/cash";
import { AdminClientsView } from "@/modules/clients";
import { RestaurantSettingsView } from "@/modules/settings";
import { AiTemplatesView } from "@/modules/ai";
import { VisionReviewView } from "@/modules/vision";
import { AdminAuditView } from "@/modules/audit";
import { Dialog } from "./components/workspace-ui";
import { useState, type ReactNode } from "react";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function setup(children: ReactNode) {
  return render(<AdminWorkspaceProvider>{children}</AdminWorkspaceProvider>);
}
function AuditProbe() {
  const { state } = useAdminWorkspace();
  return <output data-testid="audit-count">{state.audit.length}</output>;
}
const views = [
  ["Menú y categorías", AdminMenuView],
  ["Recetas y versiones", RecipeManagementView],
  ["Proveedores", SupplierManagementView],
  ["Compras y recepciones", PurchaseManagementView],
  ["Planificación de producción", ProductionPlanView],
  ["Reportes", AdminReportsView],
  ["Cierres de caja históricos", CashClosingsView],
  ["Clientes e incidencias", AdminClientsView],
  ["Configuración del restaurante", RestaurantSettingsView],
  ["IA y mensajería", AiTemplatesView],
  ["Cámaras y revisión de señales", VisionReviewView],
  ["Auditoría", AdminAuditView],
] as const;
describe("administrative views", () => {
  it.each(views)(
    "renders %s and recovers from simulated loading, empty and error states",
    async (title, View) => {
      const user = userEvent.setup();
      setup(<View />);
      expect(
        screen.getByRole("heading", { level: 1, name: title }),
      ).toBeInTheDocument();
      await user.click(screen.getByText("Opciones de demostración"));
      await user.selectOptions(screen.getByLabelText("Escenario"), "Error");
      expect(
        screen.getByRole("button", { name: "Reintentar" }),
      ).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Reintentar" }));
      await user.selectOptions(screen.getByLabelText("Escenario"), "Sin datos");
      await user.click(
        screen.getByRole("button", { name: "Mostrar datos de ejemplo" }),
      );
      await user.selectOptions(screen.getByLabelText("Escenario"), "Cargando");
      await user.click(
        screen.getByRole("button", { name: "Finalizar carga de ejemplo" }),
      );
      expect(
        screen.getByRole("heading", { level: 1, name: title }),
      ).toBeInTheDocument();
    },
  );
  it("creates a menu dish, filters it and protects changes in read-only mode", async () => {
    const user = userEvent.setup();
    setup(
      <>
        <AdminMenuView />
        <AuditProbe />
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Agregar platillo" }));
    await user.type(screen.getByLabelText("Nombre"), "Prueba del chef");
    await user.clear(screen.getByLabelText("Precio (Q)"));
    await user.type(screen.getByLabelText("Precio (Q)"), "52");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(
      screen.getByRole("heading", { name: "Prueba del chef" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("audit-count")).toHaveTextContent("2");
    await user.type(screen.getByLabelText("Buscar"), "Prueba del chef");
    expect(
      screen.queryByRole("heading", { name: "Ramen de la casa" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByText("Opciones de demostración"));
    await user.click(screen.getByLabelText("Vista de solo lectura"));
    expect(
      screen.getByRole("button", { name: "Agregar platillo" }),
    ).toBeDisabled();
  });
  it("preserves the original recipe when creating and publishing a new version", async () => {
    const user = userEvent.setup();
    setup(<RecipeManagementView />);
    const row = screen
      .getAllByRole("row")
      .find((r) => within(r).queryByText("Vigente"))!;
    await user.click(
      within(row).getByRole("button", { name: "Crear versión" }),
    );
    await user.clear(screen.getByLabelText("Rendimiento (porciones)"));
    await user.type(screen.getByLabelText("Rendimiento (porciones)"), "15");
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));
    const newRow = screen
      .getAllByRole("row")
      .find((r) => within(r).queryByText("Versión 3"))!;
    await user.click(
      within(newRow).getByRole("button", { name: "Marcar vigente" }),
    );
    await user.type(
      screen.getByLabelText("Motivo"),
      "Ajuste de rendimiento de prueba",
    );
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(screen.getAllByText("Histórica", { selector: "span" })).toHaveLength(
      2,
    );
    expect(screen.getByText("15 porciones")).toBeInTheDocument();
  });
  it("cancels a sensitive purchase action without creating an audit event", async () => {
    const user = userEvent.setup();
    setup(
      <>
        <PurchaseManagementView />
        <AuditProbe />
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Registrar compra" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Cancelar",
      }),
    );
    expect(screen.getByTestId("audit-count")).toHaveTextContent("1");
    expect(
      screen.getByRole("button", { name: "Registrar compra" }),
    ).toBeInTheDocument();
  });
  it("receives a partial purchase only after reasoned confirmation", async () => {
    const user = userEvent.setup();
    setup(<PurchaseManagementView />);
    const row = screen
      .getAllByRole("row")
      .find((r) => within(r).queryByText("PO-102"))!;
    await user.click(
      within(row).getByRole("button", { name: "Registrar ingreso" }),
    );
    await user.clear(screen.getByLabelText("Vegetales · pendiente 10"));
    await user.type(screen.getByLabelText("Vegetales · pendiente 10"), "4");
    await user.click(screen.getByRole("button", { name: "Revisar ingreso" }));
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
    await user.type(
      screen.getByLabelText("Motivo"),
      "Entrega parcial recibida",
    );
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(screen.getByText("9 kg")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Recepción registrada y existencias de demostración actualizadas.",
      ),
    ).toBeInTheDocument();
  });
  it("rejects a duplicate client restriction and preserves scope history on removal", async () => {
    const user = userEvent.setup();
    setup(<AdminClientsView />);
    const row = screen
      .getAllByRole("row")
      .find((r) => within(r).queryByText("Cliente de ejemplo 02"))!;
    await user.click(
      within(row).getByRole("button", { name: "Aplicar restricción" }),
    );
    await user.type(screen.getByLabelText("Motivo de restricción"), "Prueba");
    await user.click(
      screen.getByRole("button", { name: "Confirmar restricción" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Ya existe");
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Cancelar",
      }),
    );
    await user.click(
      within(row).getByRole("button", { name: "Consultar historial" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Retirar restricción" }),
    );
    await user.type(screen.getByLabelText("Motivo"), "Incidencia resuelta");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(
      screen.getByText("Restricción retirada; historial conservado."),
    ).toBeInTheDocument();
  });
  it("preserves the settings form on failed save and supports retry", async () => {
    const user = userEvent.setup();
    setup(<RestaurantSettingsView />);
    await user.clear(screen.getByLabelText("Propina sugerida (%)"));
    await user.type(screen.getByLabelText("Propina sugerida (%)"), "12");
    await user.click(screen.getByText("Escenario de guardado"));
    await user.click(screen.getByLabelText("Simular error al guardar"));
    await user.click(screen.getByRole("button", { name: "Revisar cambios" }));
    await user.type(screen.getByLabelText("Motivo"), "Prueba de guardado");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tu formulario se conserva",
    );
    expect(screen.getByLabelText("Propina sugerida (%)")).toHaveValue(12);
    await user.click(screen.getByLabelText("Simular error al guardar"));
    await user.click(screen.getByRole("button", { name: "Revisar cambios" }));
    await user.type(screen.getByLabelText("Motivo"), "Reintento");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(
      await screen.findByText("Configuración guardada en esta sesión."),
    ).toBeInTheDocument();
  });
  it("filters reports by date and prevents exporting an invalid range", async () => {
    const user = userEvent.setup();
    setup(<AdminReportsView />);
    fireEvent.change(screen.getByLabelText("Desde"), {
      target: { value: "2026-10-01" },
    });
    expect(screen.getByRole("button", { name: "Exportar CSV" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("período válido");
    await user.selectOptions(screen.getByLabelText("Canal"), "Delivery");
    expect(screen.getByLabelText("Canal")).toHaveValue("Delivery");
  });
  it("records human vision review without changing inventory", async () => {
    const user = userEvent.setup();
    function Probe() {
      const { state } = useAdminWorkspace();
      return <output data-testid="stock">{state.ingredients[0].stock}</output>;
    }
    setup(
      <>
        <VisionReviewView />
        <Probe />
        <AuditProbe />
      </>,
    );
    await user.click(
      screen.getAllByRole("button", { name: "Confirmar señal" })[0],
    );
    await user.type(
      screen.getByLabelText("Motivo"),
      "Revisión humana de ejemplo",
    );
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(
      screen.getByText("Confirmada", { selector: "span" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("stock")).toHaveTextContent("12");
    expect(screen.getByTestId("audit-count")).toHaveTextContent("2");
  });
  it("opens a native modal, handles cancel and restores the opener focus", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Abrir</button>
          {open && (
            <Dialog title="Prueba" onClose={() => setOpen(false)}>
              Contenido
            </Dialog>
          )}
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Abrir" });
    await user.click(opener);
    fireEvent(
      screen.getByRole("dialog"),
      new Event("cancel", { bubbles: true, cancelable: true }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});

describe("remaining administrative actions", () => {
  it("protects a used category and removes an empty category with confirmation", async () => {
    const user = userEvent.setup();
    setup(<AdminMenuView />);
    await user.click(
      screen.getByRole("button", { name: "Especialidades (4)" }),
    );
    expect(
      screen.getByRole("button", { name: "Eliminar categoría" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Bebidas (0)" }));
    await user.click(
      screen.getByRole("button", { name: "Eliminar categoría" }),
    );
    await user.type(screen.getByLabelText("Motivo"), "Categoría sin uso");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(
      screen.queryByRole("button", { name: "Bebidas (0)" }),
    ).not.toBeInTheDocument();
  });
  it("edits a supplier and preserves its purchase history", async () => {
    const user = userEvent.setup();
    setup(<SupplierManagementView />);
    const row = screen
      .getAllByRole("row")
      .find((r) => within(r).queryByText("Abastos Oriente · Demo"))!;
    await user.click(within(row).getByRole("button", { name: "Editar" }));
    await user.clear(screen.getByLabelText("Persona de contacto"));
    await user.type(
      screen.getByLabelText("Persona de contacto"),
      "Contacto actualizado",
    );
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(screen.getByText("Contacto actualizado")).toBeInTheDocument();
    await user.click(
      within(row).getByRole("button", { name: "Ver historial" }),
    );
    expect(
      within(screen.getByRole("dialog")).getByText("PO-101"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog")).getByText("PO-103"),
    ).toBeInTheDocument();
  });
  it("approves a production suggestion without automatically starting it", async () => {
    const user = userEvent.setup();
    setup(<ProductionPlanView />);
    await user.click(screen.getAllByRole("button", { name: "Aceptar" })[0]);
    await user.type(screen.getByLabelText("Motivo"), "Plan revisado");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(
      screen.getByText("Aceptada", { selector: "span" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Iniciar preparación" }),
    ).toBeInTheDocument();
  });
  it("shows cash difference with the expected amount breakdown", async () => {
    const user = userEvent.setup();
    setup(<CashClosingsView />);
    const row = screen
      .getAllByRole("row")
      .find((r) => within(r).queryByText("CLOSE-102"))!;
    await user.click(
      within(row).getByRole("button", { name: "Abrir desglose" }),
    );
    const modal = within(screen.getByRole("dialog"));
    expect(modal.getByText("Efectivo esperado")).toBeInTheDocument();
    expect(modal.getByText(/700\.00/)).toBeInTheDocument();
    expect(modal.getByText(/-.*20\.00/)).toBeInTheDocument();
  });
  it("saves a template locally and previews its exact content", async () => {
    const user = userEvent.setup();
    setup(<AiTemplatesView />);
    await user.click(screen.getByRole("button", { name: "Nueva plantilla" }));
    await user.type(
      screen.getByLabelText("Nombre de plantilla"),
      "Respuesta revisada",
    );
    await user.type(
      screen.getByLabelText("Contenido"),
      "Nuestro equipo revisará tu consulta.",
    );
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(
      screen.getByText("Plantilla guardada. No se envió ningún mensaje."),
    ).toBeInTheDocument();
    const row = screen
      .getAllByRole("row")
      .find((r) => within(r).queryByText("Respuesta revisada"))!;
    await user.click(
      within(row).getByRole("button", { name: "Previsualizar" }),
    );
    expect(
      within(screen.getByRole("dialog")).getByText(
        "Nuestro equipo revisará tu consulta.",
      ),
    ).toBeInTheDocument();
  });
  it("opens an audit record with before, after and reason", async () => {
    const user = userEvent.setup();
    setup(<AdminAuditView />);
    await user.click(screen.getByRole("button", { name: "Abrir evento" }));
    const modal = within(screen.getByRole("dialog"));
    expect(modal.getByText("Propina: 0%")).toBeInTheDocument();
    expect(modal.getByText("Propina: 10%")).toBeInTheDocument();
    expect(
      modal.getByText("Ejemplo de modificación configurable."),
    ).toBeInTheDocument();
  });
});
