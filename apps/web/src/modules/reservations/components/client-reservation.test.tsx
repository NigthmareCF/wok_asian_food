import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ClientSessionProvider } from "@/modules/clients/client-session-provider";
import {
  createClientSessionStore,
  localDate,
} from "@/modules/clients/client-session";
import { validateReservation } from "../client-reservation";
import { ReservationFormView } from "./reservation-form-view";

afterEach(cleanup);
describe("Client reservation session", () => {
  it.each(["21:15", "21:16", "21:30", "21:31", "22:00"])(
    "records %s as pending with and without preorder, by click and direct submit",
    (time) => {
      for (const includesPreorder of [false, true]) {
        for (const submitDirectly of [false, true]) {
          const draft = {
            date: localDate(new Date()),
            time,
            people: 4,
            includesPreorder,
            note: "Cerca de la entrada",
            serviceTime: "",
          };
          const store = createClientSessionStore();
          store.updateReservation(draft);
          const view = render(
            <ClientSessionProvider store={store}>
              <ReservationFormView />
            </ClientSessionProvider>,
          );
          const late = time !== "21:15";
          const button = screen.getByRole("button", { name: "CONTINUAR" });
          expect(button).toBeEnabled();
          expect(screen.getByLabelText("HORA")).not.toHaveAttribute("max");
          expect(
            Boolean(
              screen.queryByRole("heading", {
                name: "Solicitud tardía: después de las 21:15.",
              }),
            ),
          ).toBe(late);
          if (late) {
            expect(
              screen.getByText(/Las solicitudes tardías están sujetas/),
            ).toHaveTextContent("disponibilidad y validación del restaurante");
            expect(
              screen.getByText(/La solicitud tardía requiere preorden/),
            ).toHaveTextContent("incluirla no garantiza aceptación");
          }
          expect(validateReservation(draft)).toEqual({});
          if (submitDirectly) fireEvent.submit(button.closest("form")!);
          else fireEvent.click(button);
          expect(store.getSnapshot().reservation).toMatchObject({
            ...draft,
            status: "pending",
          });
          expect(
            screen.getByRole("heading", {
              name: "Solicitud de reserva pendiente de validación",
            }),
          ).toHaveFocus();
          expect(
            screen.getByText(/Guardada localmente; todavía no enviada/),
          ).toHaveTextContent("que decide su aceptación");
          expect(
            screen.queryByText(
              /reserva confirmada|rechazada|No se aceptan reservas/i,
            ),
          ).not.toBeInTheDocument();
          view.unmount();
        }
      }
    },
  );
  it("uses today's local date and retains a draft through a layout remount", async () => {
    const store = createClientSessionStore();
    const mount = () =>
      render(
        <ClientSessionProvider store={store}>
          <ReservationFormView />
        </ClientSessionProvider>,
      );
    const view = mount();
    expect(screen.getByLabelText("FECHA")).toHaveValue(localDate(new Date()));
    fireEvent.change(screen.getByRole("textbox", { name: "NOTA ESPECIAL" }), {
      target: { value: "Cerca de la entrada" },
    });
    const link = screen.getByRole("link", { name: "Sí" });
    link.addEventListener("click", (event) => event.preventDefault());
    expect(link).toHaveAttribute("href", "/menu");
    fireEvent.click(link);
    view.unmount();
    mount();
    expect(screen.getByRole("textbox", { name: "NOTA ESPECIAL" })).toHaveValue(
      "Cerca de la entrada",
    );
    expect(store.getSnapshot().reservationDraft?.includesPreorder).toBe(true);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "CONTINUAR" }));
    expect(
      screen.getByText("Solicitada; productos pendientes de vincular"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "CONTINUAR" }),
    ).not.toBeInTheDocument();
    expect(store.getSnapshot().reservation?.status).toBe("pending");
  });
  it("validates missing, expired and malformed data without deciding acceptance", () => {
    const draft = {
      date: "2026-09-17",
      time: "21:15",
      people: 4,
      includesPreorder: false,
      note: "",
      serviceTime: "",
    };
    const now = new Date(2026, 8, 17);
    expect(validateReservation(draft, now)).toEqual({});
    expect(
      validateReservation({ ...draft, time: "21:16" }, now).preorder,
    ).toBeUndefined();
    expect(
      validateReservation({ ...draft, date: "2026-09-16" }, now).date,
    ).toBeTruthy();
    expect(
      validateReservation(
        {
          ...draft,
          date: "2026-02-30",
          time: "25:00",
          people: 1.5,
          serviceTime: "bad",
        },
        now,
      ),
    ).toHaveProperty("serviceTime");
  });
});
