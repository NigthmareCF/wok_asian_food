import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { LiveServiceSummary } from "./live-service-summary";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("displays persisted policy without implying opening hours or ETA", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json([
        { code: "LOCAL", status: "PAUSED" },
        { code: "PICKUP", status: "MANUAL_APPROVAL" },
      ]),
    ),
  );
  render(<LiveServiceSummary />);
  expect(screen.getByRole("status")).toHaveTextContent("Cargando servicios");
  expect(await screen.findByText("Servicio local: Pausado")).toBeVisible();
  expect(screen.getByText("Recoger: Requiere aprobación")).toBeVisible();
  expect(screen.queryByText("Abierto")).not.toBeInTheDocument();
  expect(screen.queryByText(/25–35/)).not.toBeInTheDocument();
});
it("shows failure then an empty response on retry", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ message: "Servicio no disponible" }, { status: 503 }),
      ),
  );
  render(<LiveServiceSummary />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Servicio no disponible",
  );
  vi.mocked(fetch).mockResolvedValue(Response.json([]));
  await userEvent.click(
    screen.getByRole("button", { name: "Actualizar servicios" }),
  );
  expect(await screen.findByText("No hay servicios publicados.")).toBeVisible();
});
