import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LiveCartProvider } from "@/modules/cart/live-cart-provider";
import { LiveReservations } from "@/modules/reservations/components/live-reservations";
import { LiveMessaging } from "@/modules/messaging/components/live-messaging";
import { clientIdentityStore } from "@/modules/clients/client-identity-store";
const id = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
let owner = id;
beforeEach(() => {
  owner = id;
  clientIdentityStore.invalidate();
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  clientIdentityStore.invalidate();
  vi.unstubAllGlobals();
});
function transport(resource: (url: string, init?: RequestInit) => Response) {
  const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) =>
    String(url) === "/bff/auth/session"
      ? Response.json({ user: { userId: owner } })
      : resource(String(url), init),
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
it("actualiza la decisión de reserva y retira el mensaje pendiente sin recarga manual", async () => {
  let status = "REQUESTED";
  const fetcher = transport(() =>
    Response.json([
      {
        requestId: id,
        reservationId: other,
        requestedAt: "2026-12-01T20:00:00Z",
        guests: 2,
        decision: "REQUIRES_HUMAN_APPROVAL",
        reservationStatus: status,
        message: "Mensaje pendiente antiguo",
        submittedAt: "2026-10-07T20:00:00Z",
      },
    ]),
  );
  render(<LiveCartProvider><LiveReservations userId={id}/></LiveCartProvider>);
  await screen.findByText("Mensaje pendiente antiguo");
  expect(
    (screen.getByLabelText("Fecha y hora de la reserva") as HTMLInputElement)
      .value,
  ).toContain("T");
  status = "CONFIRMED";
  fireEvent(window, new Event("online"));
  await screen.findByText("Estado actual: Confirmada.");
  expect(
    screen.queryByText("Mensaje pendiente antiguo"),
  ).not.toBeInTheDocument();
  const read = fetcher.mock.calls.find(
    ([url]) => String(url) === "/bff/reservations",
  );
  expect(read?.[1]?.headers).toMatchObject({ "X-Wok-Expected-Principal": id });
});
it("muestra una respuesta nueva y oculta mensajes al cambiar el principal", async () => {
  let answered = false;
  const fetcher = transport((url) =>
    url.endsWith("/messages")
      ? Response.json([
          {
            messageId: id,
            senderType: "CUSTOMER",
            body: "Consulta inicial",
            status: "SENT",
            createdAt: "2026-10-07T20:00:00Z",
          },
          ...(answered
            ? [
                {
                  messageId: other,
                  senderType: "HUMAN",
                  body: "Respuesta actual",
                  status: "SENT",
                  createdAt: "2026-10-07T20:01:00Z",
                },
              ]
            : []),
        ])
      : Response.json([
          {
            conversationId: id,
            status: answered ? "OPEN" : "WAITING",
            handlingMode: "HUMAN",
            updatedAt: "2026-10-07T20:00:00Z",
          },
        ]),
  );
  const user = userEvent.setup();
  render(<LiveMessaging userId={id} />);
  await user.click(await screen.findByRole("button", { name: /Restaurante/ }));
  await screen.findByText("Consulta inicial");
  answered = true;
  fireEvent(window, new Event("online"));
  await screen.findByText("Respuesta actual");
  expect(
    screen.getByRole("log", { name: "Historial de mensajes" }),
  ).toHaveTextContent("Respuesta actual");
  const read = fetcher.mock.calls.find(([url]) =>
    String(url).endsWith("/messages"),
  );
  expect(read?.[1]?.headers).toMatchObject({ "X-Wok-Expected-Principal": id });
  owner = other;
  await act(async () => {
    await clientIdentityStore.refresh();
  });
  expect(screen.queryByText("Respuesta actual")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Tu mensaje")).not.toBeInTheDocument();
});
