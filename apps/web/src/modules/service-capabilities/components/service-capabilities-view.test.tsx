import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ServiceCapabilitiesView } from "./service-capabilities-view";

const capability = {
  code: "DELIVERY",
  status: "MANUAL_APPROVAL" as const,
  reason: "Revalidar cobertura",
  rowVersion: 3,
  policyVersion: 4,
  effectiveFrom: "2026-10-01T12:00:00Z",
  effectiveUntil: null,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ServiceCapabilitiesView", () => {
  it("renders the real capability DTO and edits only status/reason", async () => {
    const updated = {
      ...capability,
      status: "PAUSED" as const,
      reason: "Mantenimiento",
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json([capability]))
      .mockResolvedValueOnce(Response.json(updated));
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<ServiceCapabilitiesView />);

    expect(await screen.findByText("DELIVERY")).toBeInTheDocument();
    expect(screen.getByText("Aprobación manual")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Editar estado" }));
    const dialog = screen.getByRole("dialog", {
      name: "Confirmar capacidad DELIVERY",
    });
    await user.selectOptions(within(dialog).getByLabelText("Estado"), "PAUSED");
    await user.clear(within(dialog).getByLabelText("Motivo"));
    await user.type(within(dialog).getByLabelText("Motivo"), "Mantenimiento");
    await user.click(
      within(dialog).getByRole("button", { name: "Confirmar cambio" }),
    );

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(fetcher).toHaveBeenLastCalledWith(
      "/bff/admin/service-capabilities/DELIVERY",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Request-Id": expect.stringMatching(/^[0-9a-f-]{36}$/i),
        }),
        body: JSON.stringify({
          status: "PAUSED",
          reason: "Mantenimiento",
          expectedVersion: 3,
        }),
      }),
    );
    expect(
      await screen.findByText("Capacidad DELIVERY actualizada."),
    ).toBeInTheDocument();
  });

  it("validates the reason and prevents double submission", async () => {
    let resolveUpdate!: (response: Response) => void;
    const update = new Promise<Response>((resolve) => {
      resolveUpdate = resolve;
    });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json([capability]))
      .mockReturnValueOnce(update);
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<ServiceCapabilitiesView />);
    await user.click(
      await screen.findByRole("button", { name: "Editar estado" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Confirmar capacidad DELIVERY",
    });
    await user.clear(within(dialog).getByLabelText("Motivo"));
    await user.click(
      within(dialog).getByRole("button", { name: "Confirmar cambio" }),
    );
    expect(
      screen.getByText("El motivo debe tener entre 3 y 500 caracteres."),
    ).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Motivo"), "Cambio aprobado");
    await user.click(
      within(dialog).getByRole("button", { name: "Confirmar cambio" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Guardando…" }),
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    resolveUpdate(Response.json(capability));
  });

  it("reloads after 409 and reports authentication/authorization errors", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json([capability]))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "conflict" }), { status: 409 }),
      )
      .mockResolvedValueOnce(Response.json([capability]));
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<ServiceCapabilitiesView />);
    await user.click(
      await screen.findByRole("button", { name: "Editar estado" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Confirmar capacidad DELIVERY",
    });
    await user.type(
      within(dialog).getByLabelText("Motivo"),
      "Actualizar política",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Confirmar cambio" }),
    );
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    cleanup();
    render(<ServiceCapabilitiesView />);
    expect(await screen.findByRole("alert")).toHaveTextContent("sesión expiró");
  });

  it("shows the empty state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([])));
    render(<ServiceCapabilitiesView />);
    expect(
      await screen.findByText("No hay capacidades activas para mostrar."),
    ).toBeInTheDocument();
  });
});
