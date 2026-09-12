import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/operation",
}));

afterEach(cleanup);

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
});
