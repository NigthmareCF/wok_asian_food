import { StrictMode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RestoreSession } from "./restore-session";

const navigation = vi.hoisted(() => ({ replacePage: vi.fn() }));
vi.mock("@/modules/auth/auth-navigation", () => navigation);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("restore session", () => {
  it("rotates only once under StrictMode and follows the authorized destination", async () => {
    const request = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ redirectTo: "/client/cart" }),
      });
    vi.stubGlobal("fetch", request);
    render(
      <StrictMode>
        <RestoreSession>Formulario de acceso</RestoreSession>
      </StrictMode>,
    );
    await waitFor(() =>
      expect(navigation.replacePage).toHaveBeenCalledWith("/client/cart"),
    );
    expect(request).toHaveBeenCalledOnce();
  });
  it("allows sign-in when there is no previous session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    render(<RestoreSession>Formulario de acceso</RestoreSession>);
    expect(await screen.findByText("Formulario de acceso")).toBeInTheDocument();
    expect(navigation.replacePage).not.toHaveBeenCalled();
  });
});
