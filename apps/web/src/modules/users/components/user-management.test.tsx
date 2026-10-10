import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserManagementView } from "./user-management-view";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";
const userRecord = {
  id: userId,
  email: "ana@example.test",
  displayName: "Ana Pérez",
  status: "ACTIVE",
  rowVersion: 4,
  createdAt: "2026-10-01T12:00:00Z",
  roles: ["OPERATIONAL"],
};
const otherUser = {
  ...userRecord,
  id: otherUserId,
  email: "otro@example.test",
  displayName: "Otro Usuario",
  roles: [],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function mockList(items = [userRecord]) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(items)));
}

describe("UserManagementView", () => {
  it("loads the real list and forwards search and pagination parameters", async () => {
    mockList([userRecord]);
    const user = userEvent.setup();
    render(<UserManagementView />);

    expect(
      await screen.findByRole("row", { name: /Ana Pérez/ }),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/bff/admin/users?search=&limit=20&offset=0",
      expect.objectContaining({ cache: "no-store" }),
    );

    await user.type(screen.getByRole("searchbox"), "ana");
    await waitFor(() =>
      expect(fetch).toHaveBeenLastCalledWith(
        "/bff/admin/users?search=ana&limit=20&offset=0",
        expect.anything(),
      ),
    );
  });

  it("shows an empty state and neutralizes 401/403 errors", async () => {
    mockList([]);
    render(<UserManagementView />);
    expect(
      await screen.findByText("No encontramos usuarios"),
    ).toBeInTheDocument();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 403 })),
    );
    cleanup();
    render(<UserManagementView />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "no tiene permiso",
    );
  });

  it("sends only a supported role change with reason and expectedVersion", async () => {
    const updated = {
      ...userRecord,
      rowVersion: 5,
      roles: ["OPERATIONAL", "ADMIN"],
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json([userRecord]))
      .mockResolvedValueOnce(Response.json(updated));
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<UserManagementView />);
    const row = await screen.findByRole("row", { name: /Ana Pérez/ });

    await user.click(
      within(row).getByRole("button", { name: "Conceder Administrativo" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Conceder rol" });
    await user.type(
      within(dialog).getByLabelText("Motivo (obligatorio)"),
      "Cobertura de turno",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Confirmar cambio" }),
    );

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(fetcher).toHaveBeenLastCalledWith(
      `/bff/admin/users/${userId}/roles/ADMIN`,
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          action: "GRANT",
          reason: "Cobertura de turno",
          expectedVersion: 4,
        }),
      }),
    );
    expect(
      await screen.findByText("Rol concedido: Administrativo."),
    ).toBeInTheDocument();
  });

  it("validates the reason and prevents double submission", async () => {
    let resolveUpdate!: (response: Response) => void;
    const update = new Promise<Response>((resolve) => {
      resolveUpdate = resolve;
    });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json([userRecord]))
      .mockReturnValueOnce(update);
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<UserManagementView />);
    const row = await screen.findByRole("row", { name: /Ana Pérez/ });
    await user.click(
      within(row).getByRole("button", { name: "Revocar Operativo" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Revocar rol" });
    await user.click(
      within(dialog).getByRole("button", { name: "Confirmar cambio" }),
    );
    expect(
      screen.getByText("Indica un motivo de 3 a 500 caracteres."),
    ).toBeInTheDocument();
    await user.type(
      within(dialog).getByLabelText("Motivo (obligatorio)"),
      "Cambio aprobado",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Confirmar cambio" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Guardando…" }),
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    resolveUpdate(Response.json(userRecord));
  });

  it("reloads the list after a conflict", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json([userRecord]))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "conflict" }), { status: 409 }),
      )
      .mockResolvedValueOnce(Response.json([{ ...userRecord, rowVersion: 5 }]));
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<UserManagementView />);
    const row = await screen.findByRole("row", { name: /Ana Pérez/ });
    await user.click(
      within(row).getByRole("button", { name: "Conceder Administrativo" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Conceder rol" });
    await user.type(
      within(dialog).getByLabelText("Motivo (obligatorio)"),
      "Actualizar asignación",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Confirmar cambio" }),
    );
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    expect(fetcher).toHaveBeenLastCalledWith(
      "/bff/admin/users?search=&limit=20&offset=0",
      expect.anything(),
    );
  });

  it("disables actions without backend endpoints", async () => {
    mockList([userRecord]);
    render(<UserManagementView />);
    expect(
      await screen.findByRole("button", { name: "Crear usuario" }),
    ).toBeDisabled();
    const row = await screen.findByRole("row", { name: /Ana Pérez/ });
    expect(within(row).getByRole("button", { name: "Editar" })).toBeDisabled();
    expect(
      within(row).getByRole("button", { name: "Activar / suspender" }),
    ).toBeDisabled();
  });
});
