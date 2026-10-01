import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ReservationSessionProvider } from "@/modules/reservations";
import { OrderSessionProvider } from "@/modules/orders";
import { DeliverySessionProvider } from "@/modules/delivery";
import { TableSessionProvider } from "@/modules/tables";
import {
  ServiceStatusProvider,
  useServiceStatus,
} from "@/modules/service-status";
import { MessagingSessionProvider } from "../messaging-session-provider";
import { MessageInboxView } from "./message-inbox-view";
import { OnlineRequestsView } from "./online-requests-view";

afterEach(cleanup);

const renderMessaging = (view: React.ReactNode) =>
  render(
    <ReservationSessionProvider>
      <OrderSessionProvider>
        <DeliverySessionProvider>
          <TableSessionProvider>
            <ServiceStatusProvider>
              <MessagingSessionProvider>{view}</MessagingSessionProvider>
            </ServiceStatusProvider>
          </TableSessionProvider>
        </DeliverySessionProvider>
      </OrderSessionProvider>
    </ReservationSessionProvider>,
  );

function SuspendedServiceHarness() {
  const { service, setStatus } = useServiceStatus();
  useEffect(() => {
    if (service.currentStatus === "suspended") return;
    setStatus({ status: "suspended", reason: "Prueba automatizada" });
  }, [service, setStatus]);
  return <OnlineRequestsView />;
}

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

  it("accepts a delivery request and links to Delivery and Payments", async () => {
    const user = userEvent.setup();
    renderMessaging(<OnlineRequestsView />);

    await user.click(screen.getByRole("button", { name: /Camila Reyes/ }));
    await user.click(
      screen.getByRole("button", { name: "Aceptar y crear delivery" }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      /vinculado a Delivery y a Pagos/,
    );
  });

  it("accepts a dine-in request assigning the requested plates to a mesa", async () => {
    const user = userEvent.setup();
    renderMessaging(<OnlineRequestsView />);

    await user.click(screen.getByRole("button", { name: /Mario Estrada/ }));
    await user.click(
      screen.getByRole("button", { name: "Asignar mesa y aceptar" }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      /vinculado a la mesa \d/,
    );
  });

  it("marks a request as not feasible while services are suspended", async () => {
    const user = userEvent.setup();
    render((
      <ReservationSessionProvider>
        <OrderSessionProvider>
          <DeliverySessionProvider>
            <TableSessionProvider>
              <ServiceStatusProvider>
                <MessagingSessionProvider>
                  <SuspendedServiceHarness />
                </MessagingSessionProvider>
              </ServiceStatusProvider>
            </TableSessionProvider>
          </DeliverySessionProvider>
        </OrderSessionProvider>
      </ReservationSessionProvider>
    ));

    expect(
      await screen.findByText("No procede según las reglas actuales"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Rechazar \(no procede\)/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Aceptar solicitud" }),
    ).toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: /Rechazar \(no procede\)/ }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      /rechazada por no proceder/,
    );
  });
});