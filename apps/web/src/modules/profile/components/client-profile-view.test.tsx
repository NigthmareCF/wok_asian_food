import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientProfileView } from "./client-profile-view";

const profile = {
  userId: "11111111-1111-4111-8111-111111111111",
  email: "cliente@wok.demo",
  displayName: "Cliente Demo",
  phone: "+502 5555-0101",
  version: 3,
};
const addresses: unknown[] = [];
const sessions: unknown[] = [];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ClientProfileView", () => {
  it("loads contract data and sends only editable fields with expectedVersion", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(profile))
      .mockResolvedValueOnce(Response.json(addresses))
      .mockResolvedValueOnce(Response.json(sessions))
      .mockResolvedValueOnce(
        Response.json({ ...profile, displayName: "Nuevo Nombre", version: 4 }),
      );
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<ClientProfileView />);
    expect(await screen.findByText(profile.email)).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Nombre visible"));
    await user.type(screen.getByLabelText("Nombre visible"), "Nuevo Nombre");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Perfil guardado",
    );
    expect(fetcher.mock.calls[3][1]).toEqual(
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          displayName: "Nuevo Nombre",
          phone: profile.phone,
          expectedVersion: 3,
        }),
      }),
    );
  });

  it("shows validation and prevents a request", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(profile))
      .mockResolvedValueOnce(Response.json(addresses))
      .mockResolvedValueOnce(Response.json(sessions));
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<ClientProfileView />);
    await screen.findByText(profile.email);
    await user.clear(screen.getByLabelText("Nombre visible"));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(screen.getByRole("alert")).toHaveTextContent("2 a 100");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("reloads after a 409 and blocks a double submission", async () => {
    let resolveUpdate: ((value: Response) => void) | undefined;
    const updateResponse = new Promise<Response>((resolve) => {
      resolveUpdate = resolve;
    });
    const fresh = { ...profile, displayName: "Otro dispositivo", version: 4 };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(profile))
      .mockResolvedValueOnce(Response.json(addresses))
      .mockResolvedValueOnce(Response.json(sessions))
      .mockReturnValueOnce(updateResponse)
      .mockResolvedValueOnce(Response.json(fresh));
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<ClientProfileView />);
    await screen.findByText(profile.email);
    const button = screen.getByRole("button", { name: "Guardar cambios" });
    await user.click(button);
    await user.click(button);
    expect(fetcher).toHaveBeenCalledTimes(4);
    resolveUpdate?.(new Response("conflict", { status: 409 }));
    expect(
      await screen.findByText(/Tus datos cambiaron en otra sesión/),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue(fresh.displayName)).toBeInTheDocument();
    expect(screen.getByText("Versión de datos: 4")).toBeInTheDocument();
  });

  it("offers login when the session has expired", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ message: "expired" }, { status: 401 }),
        ),
    );
    render(<ClientProfileView />);
    expect(
      await screen.findByRole("link", { name: "Iniciar sesión" }),
    ).toHaveAttribute("href", "/login?next=%2Fclient%2Fprofile");
  });

  it("lists and creates an address using the address DTO", async () => {
    const address = {
      addressId: "22222222-2222-4222-8222-222222222222",
      label: "Casa",
      address: "Zona 10, avenida 1 2-34",
      reference: null,
      contactPhone: "+502 5555-0101",
      isDefault: true,
      version: 1,
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(profile))
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json(sessions))
      .mockResolvedValueOnce(Response.json(address));
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<ClientProfileView />);
    await screen.findByText(profile.email);
    await user.click(screen.getByRole("button", { name: "Agregar dirección" }));
    await user.type(screen.getByLabelText("Nombre", { exact: true }), "Casa");
    await user.type(
      screen.getByLabelText("Dirección completa"),
      "Zona 10, avenida 1 2-34",
    );
    await user.type(
      screen.getByLabelText("Teléfono de contacto"),
      "+502 5555-0101",
    );
    await user.click(screen.getByRole("button", { name: "Guardar dirección" }));
    expect(
      await screen.findByText("Casa · Predeterminada"),
    ).toBeInTheDocument();
    expect(fetcher.mock.calls[3][1]).toEqual(
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          label: "Casa",
          address: "Zona 10, avenida 1 2-34",
          reference: "",
          contactPhone: "+502 5555-0101",
          isDefault: true,
        }),
      }),
    );
  });

  it("identifies the current session and revokes another after confirmation", async () => {
    const current = {
      sessionId: "33333333-3333-4333-8333-333333333333",
      clientType: "WEB",
      deviceName: null,
      createdAt: "2026-10-08T12:00:00Z",
      lastActivityAt: "2026-10-08T12:30:00Z",
      current: true,
    };
    const other = {
      ...current,
      sessionId: "44444444-4444-4444-8444-444444444444",
      clientType: "MOBILE",
      deviceName: "Teléfono móvil",
      current: false,
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(profile))
      .mockResolvedValueOnce(Response.json([current, other]))
      .mockResolvedValueOnce(Response.json(addresses))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json([current]));
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<ClientProfileView />);
    expect(
      await screen.findByText("Sesión actual", { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText("Teléfono móvil")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Revocar sesi.n/ }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Revocar sesi.n/ }));
    expect(await screen.findByText(/Revocar esta sesi.n/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /revocar sesi.n/ }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(5));
    expect(screen.queryByText("Teléfono móvil")).not.toBeInTheDocument();
    expect(fetcher.mock.calls[3][1]).toEqual(
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(fetcher.mock.calls[4][0]).toBe("/bff/client/sessions");
  });
});
