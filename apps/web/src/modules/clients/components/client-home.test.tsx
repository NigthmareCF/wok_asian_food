import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ServiceSummary } from "./client-home";

afterEach(cleanup);

describe("Client service summary", () => {
  it("identifies the estimate as a demonstration and excludes transit", () => {
    render(
      <ServiceSummary
        service={{
          state: "open",
          preparationMinutes: [25, 35],
          availability: "Servicio disponible",
        }}
      />,
    );
    expect(screen.getByText("Datos demostrativos")).toBeInTheDocument();
    expect(
      screen.getByText("Preparación estimada: 25–35 min"),
    ).toBeInTheDocument();
    expect(screen.getByText(/No incluye traslado/)).toBeInTheDocument();
  });

  it("does not expose a stale estimate or availability when closed", () => {
    render(
      <ServiceSummary
        service={{
          state: "closed",
          preparationMinutes: [25, 35],
          availability: "Servicio disponible",
        }}
      />,
    );
    expect(screen.getByText("Cerrado")).toBeInTheDocument();
    expect(
      screen.getByText("Sin estimación de preparación"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/25–35/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Servicio disponible/)).not.toBeInTheDocument();
  });

  it("does not invent an estimate when none is supplied", () => {
    render(
      <ServiceSummary
        service={{
          state: "open",
          preparationMinutes: null,
          availability: "Servicio disponible",
        }}
      />,
    );
    expect(screen.getByText("Abierto")).toBeInTheDocument();
    expect(
      screen.getByText("Sin estimación de preparación"),
    ).toBeInTheDocument();
  });
});
