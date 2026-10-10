import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LiveProfile } from "./live-profile";
const fixture = vi.hoisted(() => ({
  reload: vi.fn(),
  id: "11111111-1111-4111-8111-111111111111",
}));
vi.mock("@/modules/clients/use-client-identity", () => ({
  useClientIdentity: () => ({ identity: {}, verified: true, refresh: vi.fn() }),
}));
vi.mock("@/modules/clients/client-identity-store", () => ({
  createClientOperation: () => ({
    confirm: async () => true,
    valid: () => true,
    dispose: vi.fn(),
    signal: new AbortController().signal,
  }),
}));
vi.mock("@/modules/client-order-tracking/use-client-pickup-resource", () => ({
  useClientPickupResource: (url: string) => ({
    data:
      url === "/bff/profile"
        ? {
            userId: fixture.id,
            email: "fixture@example.test",
            displayName: "Prueba",
            phone: null,
            version: 3,
          }
        : [],
    error: null,
    reload: fixture.reload,
  }),
}));
beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
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
