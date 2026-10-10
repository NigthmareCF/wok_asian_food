import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LiveProfile } from "./live-profile";
const fixture = vi.hoisted(() => ({
  reload: vi.fn(),
  addressReload: vi.fn(),
  sessionReload: vi.fn(),
  id: "11111111-1111-4111-8111-111111111111",
  otherId: "22222222-2222-4222-8222-222222222222",
  identity: {
    status: "verified" as const,
    ownerId: "11111111-1111-4111-8111-111111111111",
    generation: 1,
  },
}));
vi.mock("@/modules/clients/use-client-identity", () => ({
  useClientIdentity: () => ({ identity: fixture.identity, verified: true, refresh: vi.fn() }),
}));
vi.mock("@/modules/clients/client-identity-store", () => ({
  createClientOperation: (scope: { ownerId: string }) => ({
    confirm: async () => fixture.identity.ownerId === scope.ownerId,
    valid: () => fixture.identity.ownerId === scope.ownerId,
    dispose: vi.fn(),
    signal: new AbortController().signal,
  }),
}));
vi.mock("@/modules/client-order-tracking/use-client-pickup-resource", () => ({
  useClientPickupResource: (url: string) =>
    url === "/bff/profile"
      ? {
          data: {
            userId: fixture.id,
            email: "fixture@example.test",
            displayName: "Prueba",
            phone: null,
            version: 3,
          },
          error: null,
          reload: fixture.reload,
        }
      : url === "/bff/client/addresses"
        ? {
            data: [
              {
                addressId: "33333333-3333-4333-8333-333333333333",
                label: "Casa",
                address: "Zona 1, Ciudad de Guatemala",
                reference: null,
                contactPhone: "+502 5555 5555",
                isDefault: false,
                version: 4,
              },
            ],
            error: null,
            reload: fixture.addressReload,
          }
        : {
            data: [
              {
                sessionId: "44444444-4444-4444-8444-444444444444",
                clientType: "WEB",
                deviceName: null,
                createdAt: "2026-01-01T00:00:00.000Z",
                lastActivityAt: "2026-01-01T00:00:00.000Z",
                current: true,
              },
              {
                sessionId: "55555555-5555-4555-8555-555555555555",
                clientType: "MOBILE",
                deviceName: "Teléfono",
                createdAt: "2026-01-01T00:00:00.000Z",
                lastActivityAt: "2026-01-01T00:00:00.000Z",
                current: false,
              },
            ],
            error: null,
            reload: fixture.sessionReload,
          },
}));
beforeEach(() => {
  fixture.identity = {
    status: "verified",
    ownerId: fixture.id,
    generation: 1,
  };
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("sends the existing version and principal and confirms only the matching server profile", async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json({
      userId: fixture.id,
      email: "fixture@example.test",
      displayName: "Prueba nueva",
      phone: null,
      version: 4,
    }),
  );
  const user = userEvent.setup();
  render(<LiveProfile userId={fixture.id} />);
  await user.clear(screen.getByLabelText("Nombre"));
  await user.type(screen.getByLabelText("Nombre"), "Prueba nueva");
  await user.click(screen.getByRole("button", { name: "Guardar perfil" }));
  await screen.findByText("Perfil guardado en el restaurante.");
  expect(fetch).toHaveBeenCalledWith(
    "/bff/profile",
    expect.objectContaining({
      headers: expect.objectContaining({
        "X-Wok-Expected-Principal": fixture.id,
      }),
      body: JSON.stringify({
        displayName: "Prueba nueva",
        phone: "",
        expectedVersion: 3,
      }),
    }),
  );
});
it.each(["conflict", "lost"])(
  "queries the current profile after %s without claiming success",
  async (kind) => {
    if (kind === "lost") vi.mocked(fetch).mockRejectedValue(new Error("lost"));
    else vi.mocked(fetch).mockResolvedValue(Response.json({}, { status: 409 }));
    const user = userEvent.setup();
    render(<LiveProfile userId={fixture.id} />);
    await user.click(screen.getByRole("button", { name: "Guardar perfil" }));
    await waitFor(() => expect(fixture.reload).toHaveBeenCalled());
    expect(
      screen.queryByText("Perfil guardado en el restaurante."),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/incierto|cambió/);
  },
);

it("does not save A after the verified session changes to B", async () => {
  const user = userEvent.setup();
  render(<LiveProfile userId={fixture.id} />);
  fixture.identity = {
    status: "verified",
    ownerId: fixture.otherId,
    generation: 2,
  };
  await user.click(screen.getByRole("button", { name: "Guardar perfil" }));
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.queryByText("Perfil guardado en el restaurante.")).not.toBeInTheDocument();
});

it("reloads address versions after changing the default and preserves drafts", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({}));
  const user = userEvent.setup();
  render(<LiveProfile userId={fixture.id} />);
  await user.type(screen.getByLabelText("Etiqueta"), " Borrador");
  await user.click(screen.getByRole("button", { name: "Usar como predeterminada" }));
  await waitFor(() => expect(fixture.addressReload).toHaveBeenCalled());
  expect(screen.getByLabelText("Etiqueta")).toHaveValue(" Borrador");
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("/bff/client/addresses/"),
    expect.objectContaining({
      body: expect.stringContaining('"expectedVersion":4'),
      headers: expect.objectContaining({ "X-Wok-Expected-Principal": fixture.id }),
    }),
  );
});

it("shows normalized address and session omissions and cannot revoke the current session", () => {
  render(<LiveProfile userId={fixture.id} />);
  expect(screen.getByText("Zona 1, Ciudad de Guatemala")).toBeInTheDocument();
  expect(screen.getByText("WEB")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Revocar sesión" })).toHaveLength(1);
});
