import { cleanup, render, screen } from "@testing-library/react";
import { usePathname, useSearchParams } from "next/navigation";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientDemoNavigation } from "./client-demo-navigation";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}));

const mockPathname = vi.mocked(usePathname);
const mockSearchParams = vi.mocked(useSearchParams);
const createSearchParams = (value = "") =>
  new URLSearchParams(value) as unknown as ReturnType<typeof useSearchParams>;

afterEach(() => {
  cleanup();
  mockPathname.mockReset();
  mockSearchParams.mockReset();
});

describe("ClientDemoNavigation", () => {
  it("renders every demo route and marks the active order view", () => {
    mockPathname.mockReturnValue("/client/orders/demo-190");
    mockSearchParams.mockReturnValue(createSearchParams());
    render(<ClientDemoNavigation />);

    [
      ["C-07 Reservación", "/client/reservations/new"],
      ["C-08 Reserva tardía", "/client/reservations/new?demo=late"],
      ["C-09 Checkout", "/client/checkout"],
      ["C-10 Pedidos", "/client/orders"],
      ["C-11 Ubicación", "/location"],
      ["C-12 Mensajes", "/client/messages"],
    ].forEach(([label, href]) => {
      expect(screen.getByRole("link", { name: label })).toHaveAttribute(
        "href",
        href,
      );
    });

    expect(screen.getByRole("link", { name: /C-10 Pedidos/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText("Actual")).toBeInTheDocument();
  });

  it("marks C-08 active for the late reservation demo query", () => {
    mockPathname.mockReturnValue("/client/reservations/new");
    mockSearchParams.mockReturnValue(createSearchParams("demo=late"));
    render(<ClientDemoNavigation />);

    expect(
      screen.getByRole("link", { name: /C-08 Reserva tardía/ }),
    ).toHaveAttribute("aria-current", "page");
  });
});
