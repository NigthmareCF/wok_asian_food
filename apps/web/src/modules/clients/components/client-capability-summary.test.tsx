import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientCapabilitySummary } from "./client-capability-summary";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Client live service status", () => {
  it("shows only public API capability states and explains manual approval", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json([
          { code: "RESERVATIONS", status: "MANUAL_APPROVAL" },
          { code: "PICKUP", status: "ENABLED" },
          { code: "DELIVERY", status: "PAUSED" },
          { code: "PRODUCTION", status: "ENABLED" },
        ]),
      ),
    );
    render(<ClientCapabilitySummary />);

    expect(await screen.findByText("Reservaciones")).toBeInTheDocument();
    expect(screen.getByText("Aprobación manual")).toBeInTheDocument();
    expect(screen.getByText("Para recoger")).toBeInTheDocument();
    expect(screen.getByText("Pausado temporalmente")).toBeInTheDocument();
    expect(screen.queryByText("Producción interna")).not.toBeInTheDocument();
    expect(screen.getByText(/se vuelve a validar al enviarla/)).toBeInTheDocument();
  });

  it("does not show an old demo state when live status cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<ClientCapabilitySummary />);

    expect(
      await screen.findByText(/No pudimos verificar la disponibilidad actual/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Abierto")).not.toBeInTheDocument();
  });
});
