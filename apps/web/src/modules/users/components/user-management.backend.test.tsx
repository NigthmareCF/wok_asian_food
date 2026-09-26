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

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const account = {
  id: "31f83580-8dc5-41c5-9f87-1c0feb9ddf10",
  email: "admin@wok.test",
  displayName: "Cuenta Operativa",
  status: "ACTIVE",
  rowVersion: 4,
  roles: ["CLIENT"],
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("Admin user API mode", () => {
  it("loads real accounts and grants one role with reason and expected version", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([account]))
      .mockResolvedValueOnce(
        jsonResponse({
          ...account,
          rowVersion: 5,
          roles: ["CLIENT", "OPERATIONAL"],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<UserManagementView backendEnabled />);
    const row = await screen.findByRole("row", { name: /Cuenta Operativa/ });
    expect(screen.getByText("API WOK")).toBeInTheDocument();
    expect(screen.queryByText("Mariana López")).not.toBeInTheDocument();

    await user.click(
      within(row).getByRole("button", { name: "Administrar roles" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Administrar roles" });
    await user.click(
      within(dialog).getByRole("checkbox", { name: /Operativo/ }),
    );
    await user.type(
      within(dialog).getByLabelText("Motivo obligatorio para auditoría"),
      "Asignación autorizada",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Guardar rol" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, request] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toContain(`/api/admin/users/${account.id}/roles/OPERATIONAL`);
    expect(request.method).toBe("PUT");
    expect(JSON.parse(String(request.body))).toEqual({
      action: "GRANT",
      reason: "Asignación autorizada",
      expectedVersion: 4,
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "El cambio quedó auditado por el backend",
    );
    expect(
      screen.getByRole("row", { name: /Cuenta Operativa/ }),
    ).toHaveTextContent("Operativo");
  });

  it("keeps the dialog open when the backend reports a stale version", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse([account]))
        .mockResolvedValueOnce(
          jsonResponse({ message: "Actualiza la lista" }, 409),
        ),
    );

    render(<UserManagementView backendEnabled />);
    const row = await screen.findByRole("row", { name: /Cuenta Operativa/ });
    await user.click(
      within(row).getByRole("button", { name: "Administrar roles" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Administrar roles" });
    await user.click(
      within(dialog).getByRole("checkbox", { name: /Administración/ }),
    );
    await user.type(
      within(dialog).getByLabelText("Motivo obligatorio para auditoría"),
      "Cambio solicitado",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Guardar rol" }),
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Actualiza la lista",
    );
    expect(
      within(dialog).getByRole("checkbox", { name: /Administración/ }),
    ).toBeChecked();
  });
});
