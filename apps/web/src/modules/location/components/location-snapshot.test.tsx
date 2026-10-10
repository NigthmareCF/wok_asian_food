import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  locationFixture,
  locationPermissionDeniedFixture,
  type LocationSnapshot as LocationSnapshotData,
} from "@/data/fixtures/location";
import { LocationSnapshot } from "./location-snapshot";

afterEach(cleanup);

describe("LocationSnapshot", () => {
  it("opens the restaurant location supplied by the owner", () => {
    render(<LocationSnapshot snapshot={locationFixture} />);

    expect(screen.getByText("Google Maps disponible")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CÓMO LLEGAR" })).toHaveAttribute(
      "href",
      "https://maps.app.goo.gl/R3Rbp29S6RZkE257A",
    );
    expect(
      screen.getByRole("link", { name: "Volver al inicio" }),
    ).toHaveAttribute("href", "/");
  });

  it("keeps navigation disabled while the provider is pending without a URL", () => {
    render(
      <LocationSnapshot
        snapshot={{
          navigationProviderState: "pending",
          permissionState: "not-requested",
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "CÓMO LLEGAR" })).toBeDisabled();
  });

  it("opens a safe example URL in another tab when navigation is available", () => {
    const snapshot: LocationSnapshotData = {
      navigationProviderState: "available",
      navigationUrl: "https://example.com/navigation",
      permissionState: "not-requested",
    };
    render(<LocationSnapshot snapshot={snapshot} />);

    expect(screen.getByText("Google Maps disponible")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CÓMO LLEGAR" })).toHaveAttribute(
      "href",
      "https://example.com/navigation",
    );
    expect(screen.getByRole("link", { name: "CÓMO LLEGAR" })).toHaveAttribute(
      "target",
      "_blank",
    );
    expect(screen.getByRole("link", { name: "CÓMO LLEGAR" })).toHaveAttribute(
      "rel",
      "noreferrer",
    );
  });

  it("keeps navigation disabled when an available provider has no URL", () => {
    const snapshot: LocationSnapshotData = {
      navigationProviderState: "available",
      permissionState: "not-requested",
    };
    render(<LocationSnapshot snapshot={snapshot} />);

    expect(screen.getByText("Navegación no configurada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CÓMO LLEGAR" })).toBeDisabled();
    expect(
      screen.getByText("El enlace para llegar todavía no está disponible."),
    ).toBeInTheDocument();
  });

  it("shows the denied permission state without requesting device location", () => {
    render(<LocationSnapshot snapshot={locationPermissionDeniedFixture} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Permiso de ubicación denegado",
    );
    expect(
      screen.getByText(
        "No se solicita ni se usa la ubicación del dispositivo.",
      ),
    ).toBeInTheDocument();
  });
});
