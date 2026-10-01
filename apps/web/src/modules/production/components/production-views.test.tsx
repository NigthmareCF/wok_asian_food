import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ProductionSessionProvider } from "../production-session-provider";
import { ProductionBatchView } from "./production-batch-view";
import { ProductionSuggestionView } from "./production-suggestion-view";

afterEach(cleanup);

const renderProduction = (view: React.ReactNode) =>
  render(<ProductionSessionProvider>{view}</ProductionSessionProvider>);

describe("Production views", () => {
  it("completes an active batch and computes the yield", async () => {
    const user = userEvent.setup();
    renderProduction(<ProductionBatchView batchId="bat-001" />);

    await user.click(
      screen.getByRole("button", { name: /Completar producción/ }),
    );
    const dialog = screen.getByRole("dialog", { name: "Completar producción" });
    await user.type(within(dialog).getByPlaceholderText("8"), "7.6");
    await user.click(
      within(dialog).getByRole("button", { name: /Confirmar completado/ }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      /Batch completado: 7.6 L \(95% rendimiento\)/,
    );
  });

  it("discards a batch only with a mandatory reason", async () => {
    const user = userEvent.setup();
    renderProduction(<ProductionBatchView batchId="bat-002" />);

    await user.click(screen.getByRole("button", { name: /Descartar batch/ }));
    const dialog = screen.getByRole("dialog", { name: "Descartar batch" });
    const confirmButton = within(dialog).getByRole("button", {
      name: /Confirmar descarte/,
    });
    expect(confirmButton).toBeDisabled();

    await user.type(
      within(dialog).getByPlaceholderText(/Ej\. Contaminación/),
      "Error de receta",
    );
    await user.click(confirmButton);

    expect(screen.getByRole("status")).toHaveTextContent(
      /Batch descartado. No se libera stock/,
    );
  });

  it("accepts a pending production suggestion", async () => {
    const user = userEvent.setup();
    renderProduction(<ProductionSuggestionView suggestionId="sug-001" />);

    await user.click(
      screen.getByRole("button", { name: /Aceptar sugerencia/ }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(/Sugerencia aceptada/);
    expect(screen.getAllByText("Aceptada").length).toBeGreaterThan(0);
  });
});