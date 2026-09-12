import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";

const pathState = vi.hoisted(() => ({ pathname: "/operation" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathState.pathname,
}));

afterEach(() => {
  pathState.pathname = "/operation";
  cleanup();
});

describe("AppShell", () => {
  it("collapses and restores the operational navigation", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AppShell context="operational">
        <div>Contenido operativo</div>
      </AppShell>,
    );

    await user.click(screen.getByRole("button", { name: "Contraer menú" }));
    expect(container.firstChild).toHaveClass("app-shell--sidebar-collapsed");
    expect(screen.getByRole("link", { name: "Mesas" })).toHaveAttribute(
      "title",
      "Mesas",
    );

    await user.click(screen.getByRole("button", { name: "Expandir menú" }));
    expect(container.firstChild).not.toHaveClass(
      "app-shell--sidebar-collapsed",
    );
  });

  it("shows admin-only management entries in the admin navigation", () => {
    pathState.pathname = "/admin";
    const { rerender } = render(
      <AppShell context="admin">
        <div>Contenido administrativo</div>
      </AppShell>,
    );

    expect(
      screen.getByRole("link", { name: "Roles y permisos" }),
    ).toHaveAttribute("href", "/admin/roles");
    expect(
      screen.getByRole("link", { name: "Personal y horarios" }),
    ).toHaveAttribute("href", "/admin/staff");

    pathState.pathname = "/operation";
    rerender(
      <AppShell context="operational">
        <div>Contenido operativo</div>
      </AppShell>,
    );

    expect(
      screen.queryByRole("link", { name: "Roles y permisos" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Personal y horarios" }),
    ).not.toBeInTheDocument();
  });
});
