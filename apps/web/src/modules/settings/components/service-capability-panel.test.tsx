import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ServiceCapabilityPanel } from "./service-capability-panel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const pickup = {
  code: "PICKUP",
  status: "MANUAL_APPROVAL",
  reason: "Revalidar disponibilidad y ETA",
  rowVersion: 3,
  policyVersion: 2,
  effectiveFrom: "2026-09-01T00:00:00Z",
  effectiveUntil: null,
};
function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("Admin service capability panel", () => {
  it("loads API policy and saves a versioned, reasoned change", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([pickup]))
      .mockResolvedValueOnce(
        jsonResponse({ ...pickup, status: "PAUSED", reason: "Carga de cocina alta", rowVersion: 4 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<ServiceCapabilityPanel />);
    expect(await screen.findByText(/API WOK/)).toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("Estado nuevo · Pedidos para recoger"),
      "PAUSED",
    );
    await user.type(
      screen.getByLabelText("Motivo del cambio · Pedidos para recoger"),
      "Carga de cocina alta",
    );
    await user.click(
      screen.getByRole("button", { name: "Guardar cambio · Pedidos para recoger" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, request] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("/api/admin/service-capabilities/PICKUP");
    expect(request.method).toBe("PUT");
    expect(JSON.parse(String(request.body))).toEqual({
      status: "PAUSED",
      reason: "Carga de cocina alta",
      expectedVersion: 3,
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "cambio guardado y auditado por el servidor",
    );
    expect(screen.getAllByText("Pausado")).toHaveLength(2);
  });

  it("does not pretend to have live data when the API is unconfigured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        jsonResponse({ message: "No se pudo consultar la configuración de servicios." }, 503),
      ),
    );
    render(<ServiceCapabilityPanel />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo consultar la configuración de servicios.",
    );
    expect(screen.queryByText("Servicio local")).not.toBeInTheDocument();
  });
});
