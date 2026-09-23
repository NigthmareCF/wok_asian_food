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
    "enforces the cutoff at %s with and without preorder",
    (time) => {
      for (const includesPreorder of [false, true]) {
        const draft = {
          date: localDate(new Date()),
          time,
          people: 4,
          includesPreorder,
          note: "",
          serviceTime: "",
        };
        const store = createClientSessionStore();
        store.updateReservation(draft);
        const view = render(
          <ClientSessionProvider store={store}>
            <ReservationFormView />
          </ClientSessionProvider>,
        );
        const rejected = time === "21:31" || time === "22:00";
        const late = time === "21:16" || time === "21:30";
        const button = screen.getByRole("button", { name: "CONTINUAR" });
        expect(button).toHaveProperty("disabled", rejected);
        if (rejected) {
          expect(screen.getByRole("alert")).toHaveTextContent(
            "No se aceptan reservas después de las 21:30",
          );
          fireEvent.click(
            screen.getByRole("button", { name: "ELEGIR OTRA HORA" }),
          );
          expect(screen.getByLabelText("HORA")).toHaveFocus();
        }
        fireEvent.submit(button.closest("form")!);
        expect(Boolean(store.getSnapshot().reservation)).toBe(
          !rejected && (!late || includesPreorder),
        );
        expect(Boolean(validateReservation(draft).time)).toBe(rejected);
        view.unmount();
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
  it("rejects missing, expired and invalid values without altering the cutoff", () => {
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
    ).toBeTruthy();
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
