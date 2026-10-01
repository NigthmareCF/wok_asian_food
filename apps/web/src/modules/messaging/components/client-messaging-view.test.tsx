import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ClientMessagingView } from "./client-messaging-view";

afterEach(cleanup);

describe("ClientMessagingView", () => {
  it("adds text only to the local conversation state", async () => {
    const user = userEvent.setup();
    render(<ClientMessagingView />);

    await user.type(
      screen.getByLabelText("Escribe un mensaje"),
      "Mensaje de prueba",
    );
    await user.click(
      screen.getByRole("button", { name: "Enviar mensaje localmente" }),
    );

    expect(screen.getByText("Mensaje de prueba")).toBeInTheDocument();
    expect(screen.getByText("Enviado localmente")).toBeInTheDocument();
  });

  it("shows connecting, error and human attention states from demo fixtures", async () => {
    const user = userEvent.setup();
    render(<ClientMessagingView />);

    await user.click(
      screen.getByRole("button", { name: "Estado de conexión" }),
    );
    expect(screen.getByText("Conectando")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Estado del mensaje" }),
    );
    expect(screen.getByText("Error")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Consulta pendiente" }),
    );
    expect(screen.getByText("Atención humana requerida")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "No se ha contactado a una persona",
    );
  });

  it("only displays a locally selected receipt name and clears it on conversation change", async () => {
    const user = userEvent.setup();
    render(<ClientMessagingView />);

    fireEvent.change(screen.getByLabelText("Seleccionar comprobante"), {
      target: { files: [new File(["demo"], "comprobante-demo.pdf")] },
    });
    expect(
      screen.getByText(/Archivo seleccionado localmente; no enviado/),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Estado de conexión" }),
    );
    expect(
      screen.queryByText(/Archivo seleccionado localmente; no enviado/),
    ).not.toBeInTheDocument();
  });
});
