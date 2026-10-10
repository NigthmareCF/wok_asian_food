import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProfileResources } from "./profile-resources";

const fixture = vi.hoisted(() => ({
  reload: vi.fn(),
  refresh: vi.fn(),
  confirm: vi.fn(),
  verified: true,
  owner: "40000000-0000-4000-8000-000000000001",
  id: "10000000-0000-4000-8000-000000000001",
}));
vi.mock("../use-client-identity", () => ({
  useClientIdentity: () => ({
    identity: {},
    verified: fixture.verified,
    refresh: fixture.refresh,
  }),
}));
vi.mock("../client-identity-store", () => ({
  createClientOperation: () => ({
    confirm: fixture.confirm,
    valid: () => true,
    dispose: vi.fn(),
    signal: new AbortController().signal,
  }),
}));
vi.mock("@/modules/client-order-tracking/use-client-pickup-resource", () => ({
  useClientPickupResource: (url: string) => ({
    data: url.endsWith("addresses")
      ? [
          {
            addressId: fixture.id,
            label: "Casa",
            address: "Zona 1 Guatemala",
            reference: null,
            contactPhone: "12345678",
            isDefault: true,
            version: 3,
          },
        ]
      : [
          {
            sessionId: fixture.id,
            clientType: "WEB",
            deviceName: "Mi navegador",
            current: false,
            createdAt: "2026-10-09T12:00:00Z",
            lastActivityAt: "2026-10-09T12:30:00Z",
          },
        ],
    error: null,
    reload: fixture.reload,
  }),
}));
beforeEach(() => {
  fixture.verified = true;
  fixture.confirm.mockResolvedValue(true);
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("updates the selected address with its version and expected principal", async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json({
      addressId: fixture.id,
      label: "Casa",
      address: "Zona 1 Guatemala",
      reference: null,
      contactPhone: "12345678",
      isDefault: true,
      version: 4,
    }),
  );
  render(<ProfileResources userId={fixture.owner} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Editar Casa" }));
  await user.click(screen.getByRole("button", { name: "Guardar dirección" }));
  await screen.findByText("Cambio confirmado en el restaurante.");
  expect(fetch).toHaveBeenCalledWith(
    `/bff/client/addresses/${fixture.id}`,
    expect.objectContaining({
      method: "PUT",
      headers: expect.objectContaining({
        "X-Wok-Expected-Principal": fixture.owner,
      }),
    }),
  );
  expect(
    JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)),
  ).toMatchObject({ expectedVersion: 3, reference: "" });
});

it("revokes a session with 204 without parsing JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
  render(<ProfileResources userId={fixture.owner} />);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Revocar sesión Mi navegador" }));
  await screen.findByText("Cambio confirmado en el restaurante.");
  expect(fetch).toHaveBeenCalledWith(
    `/bff/client/sessions/${fixture.id}`,
    expect.objectContaining({
      method: "DELETE",
      headers: { "X-Wok-Expected-Principal": fixture.owner },
    }),
  );
});

it("clears stale editing on conflict and reloads instead of claiming success", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({}, { status: 409 }));
  render(<ProfileResources userId={fixture.owner} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Editar Casa" }));
  await user.click(screen.getByRole("button", { name: "Guardar dirección" }));
  await screen.findByText(/Los datos cambiaron/);
  expect(screen.getByLabelText("Nombre de dirección")).toHaveValue("");
  expect(fixture.reload).toHaveBeenCalled();
  expect(
    screen.queryByText("Cambio confirmado en el restaurante."),
  ).not.toBeInTheDocument();
});

it("does not send mutations after identity confirmation fails", async () => {
  fixture.confirm.mockResolvedValue(false);
  render(<ProfileResources userId={fixture.owner} />);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Eliminar Casa" }));
  expect(fetch).not.toHaveBeenCalled();
});

it("does not show resources when identity is unverified", () => {
  fixture.verified = false;
  render(<ProfileResources userId={fixture.owner} />);
  expect(screen.queryByText("Mis direcciones")).not.toBeInTheDocument();
});
