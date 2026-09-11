import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ReservationSessionProvider } from "@/modules/reservations";
import { MessagingSessionProvider } from "../messaging-session-provider";
import { MessageInboxView } from "./message-inbox-view";
import { OnlineRequestsView } from "./online-requests-view";

afterEach(cleanup);

const renderMessaging = (view: React.ReactNode) =>
  render(
    <ReservationSessionProvider>
      <MessagingSessionProvider>{view}</MessagingSessionProvider>
    </ReservationSessionProvider>,
  );

describe("Messaging views", () => {
  it("requires taking a conversation before replying", async () => {
    const user = userEvent.setup();
    renderMessaging(<MessageInboxView />);

    const reply = screen.getByLabelText("Responder mensaje");
    expect(reply).toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: "Tomar conversación" }),
    );
    expect(reply).toBeEnabled();

    await user.type(reply, "Claro, actualizaremos el horario.");
    await user.click(screen.getByRole("button", { name: "Enviar respuesta" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Respuesta enviada en el canal simulado.",
    );
    expect(
      screen.getAllByText("Claro, actualizaremos el horario."),
    ).toHaveLength(2);
  });

  it("revalidates an outdated request before accepting it", async () => {
    const user = userEvent.setup();
    renderMessaging(<OnlineRequestsView />);

    await user.click(screen.getByRole("button", { name: /Ricardo Fuentes/ }));
    expect(
      screen.queryByRole("button", { name: "Aceptar solicitud" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Revalidar" }));
    await user.click(screen.getByRole("button", { name: "Aceptar solicitud" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      /Solicitud aceptada y convertida en RSV-/,
    );
  });

  it("requires a rejection reason", async () => {
    const user = userEvent.setup();
    renderMessaging(<OnlineRequestsView />);

    const reject = screen.getByRole("button", { name: "Rechazar" });
    expect(reject).toBeDisabled();
    await user.selectOptions(
      screen.getByLabelText("Motivo de rechazo"),
      "Sin disponibilidad",
    );
    expect(reject).toBeEnabled();
  });
});
