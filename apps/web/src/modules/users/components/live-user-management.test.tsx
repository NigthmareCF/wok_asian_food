import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LiveUserManagement } from "./live-user-management";
import { clientIdentityStore } from "@/modules/clients/client-identity-store";
const actor = "11111111-1111-4111-8111-111111111111",
  target = "22222222-2222-4222-8222-222222222222";
beforeEach(() => clientIdentityStore.invalidate());
afterEach(() => {
  cleanup();
  clientIdentityStore.invalidate();
  vi.unstubAllGlobals();
});
it("confirma un cambio de rol con motivo y versión, consulta el estado real y devuelve el foco", async () => {
  let version = 1,
    assigned = false;
  const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url) === "/bff/auth/session")
      return Response.json({ user: { userId: actor } });
    const user = {
      id: target,
      email: "fixture@example.test",
      displayName: "Usuario de prueba",
      status: "ACTIVE",
      rowVersion: version,
      createdAt: "2026-10-07T20:00:00Z",
      roles: assigned ? ["CLIENT", "OPERATIONAL"] : ["CLIENT"],
    };
    if (init?.method === "PUT") {
      assigned = true;
      version++;
      return Response.json({
        ...user,
        roles: ["CLIENT", "OPERATIONAL"],
        rowVersion: version,
      });
    }
    return Response.json([user]);
  });
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  render(<LiveUserManagement userId={actor} />);
  await user.click(
    await screen.findByRole("button", {
      name: "Asignar Operativo a Usuario de prueba",
    }),
  );
  expect(screen.getByLabelText("Motivo")).toHaveFocus();
  await user.type(screen.getByLabelText("Motivo"), "Prueba controlada");
  await user.click(screen.getByRole("button", { name: "Confirmar cambio" }));
  await screen.findByText("Cambio de rol confirmado por el servidor.");
  const action = fetcher.mock.calls.find(([, init]) => init?.method === "PUT");
  expect(action?.[0]).toBe(`/bff/admin/users/${target}/roles/OPERATIONAL`);
  expect(action?.[1]?.body).toBe(
    JSON.stringify({
      action: "GRANT",
      reason: "Prueba controlada",
      expectedVersion: 1,
    }),
  );
  expect(action?.[1]?.headers).toMatchObject({
    "X-Wok-Expected-Principal": actor,
  });
  await waitFor(() =>
    expect(
      screen.getByRole("button", {
        name: "Retirar Operativo a Usuario de prueba",
      }),
    ).toHaveFocus(),
  );
});
