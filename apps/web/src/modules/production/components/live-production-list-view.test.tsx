import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LiveProductionListView } from "./live-production-list-view";
afterEach(cleanup);
it("muestra estados del servidor y vacío real", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([])));
  render(<LiveProductionListView />);
  expect(
    await screen.findByText("No hay lotes de producción."),
  ).toBeInTheDocument();
  vi.unstubAllGlobals();
});
