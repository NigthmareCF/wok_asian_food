import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ChangePasswordForm,
  LoginForm,
  RegisterForm,
  ResetPasswordForm,
} from "./auth-flows";

const navigation = vi.hoisted(() => ({ replacePage: vi.fn() }));

vi.mock("@/modules/auth/auth-navigation", () => navigation);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("auth flows", () => {
  it("requires a password when signing in", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(
      screen.getByLabelText("Correo electrónico"),
      "cliente@example.com",
    );
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    expect(screen.getByText("Ingresa tu contraseña.")).toBeInTheDocument();
  });

  it("creates the server session and follows the role landing route", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            redirectTo: "/operation",
            user: {
              displayName: "Operación Demo",
              email: "operacion@example.test",
              permissions: [],
              roles: ["OPERATIONAL"],
              status: "ACTIVE",
              userId: "demo",
            },
          }),
      }),
    );
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(
      screen.getByLabelText("Correo electrónico"),
      "operacion@example.test",
    );
    await user.type(screen.getByLabelText("Contraseña"), "DemoWok!2026");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    expect(fetch).toHaveBeenCalledWith(
      "/bff/auth/login",
      expect.objectContaining({ method: "POST" }),
    );
    expect(navigation.replacePage).toHaveBeenCalledWith("/operation");
  });

  it("reports that phone authentication is not enabled", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole("button", { name: "Usar teléfono" }));
    await user.type(screen.getByLabelText("Teléfono"), "55551234");
    await user.type(screen.getByLabelText("Contraseña"), "DemoWok!2026");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "El acceso por teléfono aún no está disponible",
    );
  });

  it("requires matching strong passwords during registration", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.type(screen.getByLabelText("Nombre"), "Ana Cliente");
    await user.type(
      screen.getByLabelText("Correo electrónico"),
      "ana@example.com",
    );
    await user.type(screen.getByLabelText("Contraseña"), "ClaveSegura1!");
    await user.type(
      screen.getByLabelText("Confirmar contraseña"),
      "OtraClave1!",
    );
    await user.click(screen.getByRole("button", { name: /crear cuenta/i }));

    expect(
      screen.getByText("Las contraseñas no coinciden."),
    ).toBeInTheDocument();
  });

  it("waits for the backend before offering email verification", async () => {
    const request = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message: "Solicitud recibida." }),
    });
    vi.stubGlobal("fetch", request);
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.type(screen.getByLabelText("Nombre"), "Ana Cliente");
    await user.type(
      screen.getByLabelText("Correo electrónico"),
      "ana@example.com",
    );
    await user.type(screen.getByLabelText("Contraseña"), "ClaveSegura12!");
    await user.type(
      screen.getByLabelText("Confirmar contraseña"),
      "ClaveSegura12!",
    );
    await user.click(screen.getByRole("button", { name: /crear cuenta/i }));

    expect(
      await screen.findByRole("link", { name: "VERIFICAR CORREO" }),
    ).toHaveAttribute("href", "/verify-email");
    expect(request).toHaveBeenCalledWith(
      "/bff/auth/flow",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({
      action: "register",
      email: "ana@example.com",
      displayName: "Ana Cliente",
    });
  });

  it("validates the recovery code and password confirmation", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm />);

    await user.type(screen.getByLabelText("Código de recuperación"), "12a");
    await user.type(screen.getByLabelText("Nueva contraseña"), "ClaveSegura1!");
    await user.type(
      screen.getByLabelText("Confirmar contraseña"),
      "OtraClave1!",
    );
    await user.click(screen.getByRole("button", { name: /restablecer/i }));

    expect(
      screen.getByText("Ingresa el código de recuperación de 6 dígitos."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Las contraseñas no coinciden."),
    ).toBeInTheDocument();
  });

  it("accepts a valid password change as a local demonstration", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm />);

    await user.type(screen.getByLabelText("Contraseña actual"), "Anterior1!");
    await user.type(screen.getByLabelText("Nueva contraseña"), "ClaveSegura1!");
    await user.type(
      screen.getByLabelText("Confirmar contraseña"),
      "ClaveSegura1!",
    );
    await user.click(screen.getByRole("button", { name: /guardar cambio/i }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Demostración completada.",
    );
  });
});
